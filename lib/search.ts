/**
 * BM25 retrieval over the prebuilt chunk index.
 *
 * The index is loaded once per server process and held in module memory.
 * Querying is O(query terms × candidate chunks); fast enough for a
 * sub-thousand-chunk corpus on a single thread.
 *
 * We add a soft article-diversity cap on top of pure BM25 so a top-K
 * window doesn't collapse onto one essay; the model gets complementary
 * material rather than three slices of the same paragraph.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CatalogEntry,
  Chunk,
  IndexFile,
  RetrievedChunk,
} from "./types";

export type { CatalogEntry, Chunk, IndexFile, RetrievedChunk } from "./types";

const BM25_K1 = 1.4;
const BM25_B = 0.75;

type IndexCache = {
  payload: IndexFile;
  byId: Map<string, Chunk>;
  avgDl: number;
};

let cache: IndexCache | null = null;
let cachePromise: Promise<IndexCache> | null = null;

async function load(): Promise<IndexCache> {
  if (cache) return cache;
  if (cachePromise) return cachePromise;
  // Capture the promise locally so the `finally` clean-up doesn't clobber
  // a NEW promise installed by a third concurrent caller. The bug being:
  //   A starts load → sets cachePromise=p1
  //   B awaits p1
  //   A finishes → finally clears cachePromise to null
  //   C arrives, sees null, starts load → sets cachePromise=p2
  //   B's `finally` (if it ran the same path) would clobber p2 to null.
  // We avoid that by only clearing cachePromise if it's still ours.
  const p = (async (): Promise<IndexCache> => {
    const file = path.join(process.cwd(), "data", "index.json");
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        throw new Error(
          "data/index.json is missing. Run `pnpm ingest` (or `pnpm scrape && pnpm index`) before starting the server. See README.md for the full pipeline.",
        );
      }
      throw err;
    }
    const payload = JSON.parse(raw) as IndexFile;
    const byId = new Map<string, Chunk>();
    for (const c of payload.chunks) byId.set(c.id, c);
    const avgDl =
      payload.chunks.reduce((s, c) => s + c.tokens.length, 0) /
      Math.max(payload.chunks.length, 1);
    const built: IndexCache = { payload, byId, avgDl };
    cache = built;
    return built;
  })();
  cachePromise = p;
  try {
    return await p;
  } finally {
    if (cachePromise === p) cachePromise = null;
  }
}

export async function getCatalog(): Promise<CatalogEntry[]> {
  const { payload } = await load();
  return payload.catalog;
}

export async function corpusStats() {
  const { payload } = await load();
  const research = payload.catalog.filter((e) => e.category === "research");
  const people = payload.catalog.filter((e) => e.category === "people");
  const totalWords = payload.catalog.reduce(
    (s, c) => s + (c.wordCount ?? 0),
    0,
  );
  return {
    research: research.length,
    people: people.length,
    chunks: payload.counts.chunks,
    totalWords,
    builtAt: payload.builtAt,
  };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && t.length < 40);
}

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have he her him his i if in into is it its of on or our she that the their them they this to was we were what when which who why will with you your".split(
    /\s+/,
  ),
);

const PERSON_QUERY_TERMS = new Set([
  "who",
  "researcher",
  "researchers",
  "fellow",
  "fellows",
  "team",
  "people",
  "staff",
  "author",
  "authors",
  "scholar",
  "scholars",
  "director",
  "leadership",
  "founder",
  "founders",
]);

/**
 * Heuristic: a chunk is "bibliography-heavy" if its text is dominated by
 * footnote markers, citation patterns, or external URLs. Used to discount
 * reference-list chunks at search time so they don't crowd out prose.
 */
function looksLikeReferences(chunk: Chunk): boolean {
  const t = chunk.text;
  // Section heading is a giveaway.
  const section = (chunk.section ?? "").toLowerCase();
  if (
    section.includes("references") ||
    section.includes("bibliography") ||
    section.includes("works cited") ||
    section.includes("further reading")
  ) {
    return true;
  }
  const footnoteMarkers = (t.match(/\[\^[\w-]+\]/g) ?? []).length;
  const urls = (t.match(/https?:\/\/\S+/g) ?? []).length;
  const academicMarkers = (
    t.match(/arxiv|doi|forum\.effectivealtruism|lesswrong/gi) ?? []
  ).length;
  // Three or more footnote refs in one chunk, or 4+ external URLs, is a
  // strong signal we're in a reference list rather than prose.
  return footnoteMarkers >= 3 || urls >= 4 || academicMarkers >= 3;
}

/**
 * BM25 with a small lexical-overlap bonus on titles, authors, and topics.
 * This boost is what surfaces "AGI and Lock-in" when a user asks about
 * lock-in even if the paper's first chunk doesn't dominate term frequency.
 */
export async function search(
  query: string,
  k: number = 12,
): Promise<RetrievedChunk[]> {
  const { payload, byId, avgDl } = await load();
  const qTerms = [...new Set(tokenize(query).filter((t) => !STOPWORDS.has(t)))];
  if (qTerms.length === 0) return [];

  const scores = new Map<string, number>();
  for (const c of payload.chunks) {
    const dl = c.tokens.length;
    if (dl === 0) continue;
    const tf = new Map<string, number>();
    for (const t of c.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of qTerms) {
      const f = tf.get(term);
      if (!f) continue;
      const idf = payload.idf[term];
      if (!idf) continue;
      const num = f * (BM25_K1 + 1);
      const den = f + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDl));
      score += idf * (num / den);
    }
    if (score > 0) scores.set(c.id, score);
  }

  // Title / author / topic overlap: soft, but enough to surface canonical
  // entry points when their slug, author, or topic name is in the query.
  for (const c of payload.chunks) {
    const haystack = [c.title, ...c.authors, ...c.topics, c.section ?? ""]
      .join(" ")
      .toLowerCase();
    let bonus = 0;
    for (const term of qTerms) {
      if (haystack.includes(term)) bonus += 0.6;
    }
    if (bonus > 0) {
      scores.set(c.id, (scores.get(c.id) ?? 0) + bonus);
    }
  }

  // Penalise bibliography-heavy chunks. Forethought articles end with long
  // reference lists which technically match queries on the named papers
  // but offer no actual content to cite. We discount them ~60% so the
  // model gets prose chunks first, but keeps a reference chunk available
  // when the user asks for "more reading on X".
  for (const [id, score] of scores) {
    const chunk = byId.get(id);
    if (!chunk) continue;
    if (looksLikeReferences(chunk)) {
      scores.set(id, score * 0.4);
    }
  }

  // Boost people-page chunks when the query is asking about people. We
  // detect this by intersecting query terms with a small "person query"
  // vocabulary; if the user said "who", "researcher", "team", "fellow",
  // people pages should not lose to research articles that happen to
  // mention the same author by name.
  const isPersonQuery = qTerms.some((t) => PERSON_QUERY_TERMS.has(t));
  if (isPersonQuery) {
    for (const [id, score] of scores) {
      const chunk = byId.get(id);
      if (chunk?.category === "people") {
        scores.set(id, score * 1.7);
      }
    }
  }

  const ranked: RetrievedChunk[] = [];
  for (const [id, score] of scores) {
    const chunk = byId.get(id);
    if (chunk) ranked.push({ chunk, score });
  }
  ranked.sort((a, b) => b.score - a.score);

  // Diversify: hard cap of 2 chunks per article so the top-K window has
  // breadth rather than collapsing onto a single essay.
  const out: RetrievedChunk[] = [];
  const perUrl = new Map<string, number>();
  for (const r of ranked) {
    const used = perUrl.get(r.chunk.url) ?? 0;
    if (used >= 2) continue;
    out.push(r);
    perUrl.set(r.chunk.url, used + 1);
    if (out.length >= k) break;
  }
  return out;
}

export async function getChunk(id: string): Promise<Chunk | null> {
  const { byId } = await load();
  return byId.get(id) ?? null;
}

/**
 * Return all chunks belonging to a given canonical article URL, in
 * document order. Used to seed the agent with context when the user
 * @-mentions an article in the composer.
 */
export async function chunksForUrl(url: string): Promise<Chunk[]> {
  const { payload } = await load();
  return payload.chunks.filter((c) => c.url === url);
}
