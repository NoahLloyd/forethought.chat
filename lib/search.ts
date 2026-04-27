/**
 * BM25 retrieval over the prebuilt chunk index.
 *
 * The index is loaded once per server process and held in module memory.
 * Querying is O(query terms × candidate chunks) — fast enough for a
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
  cachePromise = (async () => {
    const file = path.join(process.cwd(), "data", "index.json");
    const raw = await fs.readFile(file, "utf8");
    const payload = JSON.parse(raw) as IndexFile;
    const byId = new Map<string, Chunk>();
    for (const c of payload.chunks) byId.set(c.id, c);
    const avgDl =
      payload.chunks.reduce((s, c) => s + c.tokens.length, 0) /
      Math.max(payload.chunks.length, 1);
    cache = { payload, byId, avgDl };
    return cache;
  })();
  try {
    return await cachePromise;
  } finally {
    cachePromise = null;
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

/**
 * BM25 with a small lexical-overlap bonus on titles, authors, and topics.
 * This boost is what surfaces "AGI and Lock-in" when a user asks about
 * lock-in even if the paper's first chunk doesn't dominate term frequency.
 */
export async function search(
  query: string,
  k: number = 12,
): Promise<RetrievedChunk[]> {
  const { payload, avgDl } = await load();
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

  // Title / author / topic overlap — soft, but enough to surface canonical
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

  const ranked: RetrievedChunk[] = [];
  for (const [id, score] of scores) {
    const chunk = payload.chunks.find((c) => c.id === id);
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
