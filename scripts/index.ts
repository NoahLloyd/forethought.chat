/**
 * Build a retrieval index from scraped Forethought content.
 *
 * Each scraped record is split into ~750-character paragraph-aware chunks
 * with a heading-based section path attached. We then compute term-frequency
 * statistics so the runtime BM25 ranker (lib/search.ts) can score chunks
 * without recomputing them on every query.
 *
 * Output: data/index.json, a single, lazily-loaded file containing every
 * chunk plus the IDF table.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const CONTENT_DIR = path.join(ROOT, "data", "content");
const OUT_FILE = path.join(ROOT, "data", "index.json");

const TARGET_CHARS = 800;
const MAX_CHARS = 1400;

type Author = { name: string; slug: string | null; role: string | null };

type ContentRecord = {
  url: string;
  category: "research" | "people" | "pages";
  slug: string;
  type: string | null;
  title: string;
  description: string;
  authors: Author[];
  topics: string[];
  publishedAt: string | null;
  series: { title: string; slug: string | null } | null;
  links: {
    podcast: string | null;
    podcastTitle: string | null;
    podcastDurationSeconds: number | null;
    lesswrong: string | null;
    eaForum: string | null;
    preprint: string | null;
    sameAs: string[];
  };
  body: string;
  text: string;
  wordCount: number;
};

type Chunk = {
  id: string;
  url: string;
  category: "research" | "people" | "pages";
  title: string;
  authors: string[];
  publishedAt: string | null;
  topics: string[];
  description: string;
  series: string | null;
  section: string | null;
  text: string;
  tokens: string[];
  source: "abstract" | "body";
};

/**
 * Tokeniser tuned for English research prose: lowercases, strips punctuation,
 * and keeps everything else as a token. We deliberately don't stem; names
 * and technical terms (`Forethought`, `MacAskill`, `lock-in`) need to match
 * cleanly. Stopwords are left in (BM25 handles them via IDF).
 */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && t.length < 40);
}

/**
 * Strip markdown to a clean text form for BM25 tokenisation. We keep the
 * markdown body in the chunk itself so the model can render proper prose;
 * tokens come from the cleaned text only.
 */
function stripMd(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/[#>*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Walk a record's markdown body and split it into chunks while preserving
 * heading context. Each chunk inherits the most recent `##`-or-deeper
 * heading as its section label so we can show users the precise location
 * of a hit.
 */
function chunkRecord(rec: ContentRecord): Chunk[] {
  const md = rec.body && rec.body.length > 50 ? rec.body : rec.text;
  const lines = md.split(/\n{2,}/g).map((l) => l.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferLen = 0;
  let section: string | null = null;
  let chunkIdx = 0;

  // Track whether we're still in the article's abstract (the prose that
  // sits before any non-title heading). Forethought renders the body
  // sections to visible HTML but stashes the abstract only in <meta>
  // tags and __NEXT_DATA__, so chunks tagged "abstract" can't be
  // text-fragment-targeted on the public page. We only enable abstract
  // tagging for records whose body actually contains the `**Abstract.**`
  // marker; for people / pages records, every chunk is "body".
  const hasAbstract = md.includes("**Abstract.**");
  let titleHeadingSeen = false;
  let abstractEnded = !hasAbstract;

  function currentSource(): "abstract" | "body" {
    return abstractEnded ? "body" : "abstract";
  }

  function flush(): void {
    if (buffer.length === 0) return;
    const text = buffer.join("\n\n").trim();
    if (text.length === 0) return;
    chunks.push({
      id: `${rec.category}/${rec.slug}#${chunkIdx}`,
      url: rec.url,
      category: rec.category,
      title: rec.title,
      authors: rec.authors.map((a) => a.name),
      publishedAt: rec.publishedAt,
      topics: rec.topics,
      description: rec.description,
      series: rec.series?.title ?? null,
      section,
      text,
      tokens: tokenize(stripMd(text)),
      source: currentSource(),
    });
    chunkIdx += 1;
    buffer = [];
    bufferLen = 0;
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      // Only update `section` for h2 and h3; h1 is the article title and
      // h4+ are usually subsection labels we'd rather treat as inline.
      if (level === 2 || level === 3) section = headingText;
      // A heading flushes the current buffer so the next chunk starts fresh.
      flush();
      // Once we've seen the second heading in an abstract-containing
      // record, mark the abstract as ended; this and subsequent chunks
      // are body content. The flush above commits the trailing abstract
      // chunk under the old flag.
      if (hasAbstract) {
        if (!titleHeadingSeen) {
          titleHeadingSeen = true;
        } else if (!abstractEnded) {
          abstractEnded = true;
        }
      }
      // Carry the heading into the next chunk so it has context.
      buffer.push(line);
      bufferLen += line.length;
      continue;
    }
    if (bufferLen + line.length > MAX_CHARS && buffer.length > 0) {
      flush();
    }
    buffer.push(line);
    bufferLen += line.length;
    if (bufferLen >= TARGET_CHARS) flush();
  }
  flush();

  return chunks;
}

/**
 * Compute IDF over the corpus so the runtime ranker can score in O(query
 * tokens × candidate chunks). We store the IDF table on disk because it
 * doesn't change between queries.
 */
function computeIdf(chunks: Chunk[]): { [token: string]: number } {
  const N = chunks.length;
  const df: Map<string, number> = new Map();
  for (const c of chunks) {
    const seen = new Set<string>();
    for (const t of c.tokens) seen.add(t);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf: { [token: string]: number } = {};
  for (const [t, n] of df) {
    idf[t] = Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }
  return idf;
}

async function main() {
  const files = (await fs.readdir(CONTENT_DIR)).filter(
    (f) =>
      f.endsWith(".json") && f !== "_all.json" && f !== "_manifest.json",
  );
  const records: ContentRecord[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, f), "utf8");
    let rec: ContentRecord;
    try {
      rec = JSON.parse(raw) as ContentRecord;
    } catch (err) {
      console.warn(
        `  ! skipping ${f}: ${(err as Error).message} (${raw.length} bytes)`,
      );
      continue;
    }
    if (rec && rec.text && rec.text.length > 80) records.push(rec);
  }
  console.log(`Indexing ${records.length} records…`);

  const chunks: Chunk[] = [];
  for (const rec of records) {
    const cs = chunkRecord(rec);
    chunks.push(...cs);
  }
  console.log(`Produced ${chunks.length} chunks.`);

  const avgLen =
    chunks.reduce((s, c) => s + c.tokens.length, 0) /
    Math.max(chunks.length, 1);

  const idf = computeIdf(chunks);

  // Build a compact catalog (per record, public metadata only) for the UI.
  const catalog = records
    .filter((r) => r.category !== "pages")
    .map((r) => ({
      url: r.url,
      category: r.category,
      slug: r.slug,
      type: r.type,
      title: r.title,
      description: r.description,
      authors: r.authors.map((a) => a.name),
      publishedAt: r.publishedAt,
      topics: r.topics,
      series: r.series?.title ?? null,
      wordCount: r.wordCount,
      links: {
        podcast: r.links?.podcast ?? null,
        podcastTitle: r.links?.podcastTitle ?? null,
        lesswrong: r.links?.lesswrong ?? null,
        eaForum: r.links?.eaForum ?? null,
        preprint: r.links?.preprint ?? null,
      },
    }))
    .sort((a, b) => {
      if (a.category !== b.category)
        return a.category.localeCompare(b.category);
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    });

  const payload = {
    version: 3,
    builtAt: new Date().toISOString(),
    counts: {
      records: records.length,
      chunks: chunks.length,
      avgTokensPerChunk: Math.round(avgLen),
    },
    idf,
    chunks,
    catalog,
  };

  await fs.writeFile(OUT_FILE, JSON.stringify(payload), "utf8");
  const stat = await fs.stat(OUT_FILE);
  console.log(
    `Wrote ${OUT_FILE} (${(stat.size / 1024 / 1024).toFixed(2)} MB).`,
  );
  console.log(
    `  records=${records.length} chunks=${chunks.length} avgTok=${Math.round(avgLen)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
