/**
 * BM25 retrieval over the prebuilt chunk index.
 *
 * Use `createSearcher({ indexPath })` to build a Searcher bound to one
 * index file. The index is loaded once per Searcher instance and held
 * in instance memory; subsequent calls hit the cache.
 *
 * Querying is O(query terms x candidate chunks) - fast enough for a
 * sub-thousand-chunk corpus on a single thread. We add a soft article-
 * diversity cap on top of pure BM25 so a top-K window doesn't collapse
 * onto one essay.
 */
import { promises as fs } from "node:fs";
import type {
  CatalogEntry,
  Chunk,
  IndexFile,
  RetrievedChunk,
} from "./types";

const BM25_K1 = 1.4;
const BM25_B = 0.75;

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

type IndexCache = {
  payload: IndexFile;
  byId: Map<string, Chunk>;
  avgDl: number;
};

export type SearcherOptions = {
  /** Absolute path to a `data/index.json` produced by the indexer. */
  indexPath: string;
};

export type Searcher = {
  search(query: string, k?: number): Promise<RetrievedChunk[]>;
  getCatalog(): Promise<CatalogEntry[]>;
  corpusStats(): Promise<{
    research: number;
    people: number;
    chunks: number;
    totalWords: number;
    builtAt: string;
  }>;
  getChunk(id: string): Promise<Chunk | null>;
};

export function createSearcher(opts: SearcherOptions): Searcher {
  const indexPath = opts.indexPath;
  let cache: IndexCache | null = null;
  let cachePromise: Promise<IndexCache> | null = null;

  async function load(): Promise<IndexCache> {
    if (cache) return cache;
    if (cachePromise) return cachePromise;
    // Capture the promise locally so the `finally` clean-up doesn't clobber
    // a NEW promise installed by a third concurrent caller.
    const p = (async (): Promise<IndexCache> => {
      let raw: string;
      try {
        raw = await fs.readFile(indexPath, "utf8");
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") {
          throw new Error(
            `Corpus index not found at ${indexPath}. Run \`pnpm ingest\` (or \`pnpm scrape && pnpm index\`) before starting the server.`,
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

  async function getCatalog(): Promise<CatalogEntry[]> {
    const { payload } = await load();
    return payload.catalog;
  }

  async function corpusStats() {
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

  async function getChunk(id: string): Promise<Chunk | null> {
    const { byId } = await load();
    return byId.get(id) ?? null;
  }

  async function search(
    query: string,
    k: number = 12,
  ): Promise<RetrievedChunk[]> {
    const { payload, byId, avgDl } = await load();
    const qTerms = [
      ...new Set(tokenize(query).filter((t) => !STOPWORDS.has(t))),
    ];
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

    // Title / author / topic overlap.
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

    // Penalise bibliography-heavy chunks.
    for (const [id, score] of scores) {
      const chunk = byId.get(id);
      if (!chunk) continue;
      if (looksLikeReferences(chunk)) {
        scores.set(id, score * 0.4);
      }
    }

    // Boost people pages on person-style queries.
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

    // Diversify: hard cap of 2 chunks per article.
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

  return { search, getCatalog, corpusStats, getChunk };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && t.length < 40);
}

function looksLikeReferences(chunk: Chunk): boolean {
  const t = chunk.text;
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
  return footnoteMarkers >= 3 || urls >= 4 || academicMarkers >= 3;
}
