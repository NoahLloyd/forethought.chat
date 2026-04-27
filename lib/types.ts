/**
 * Shared types for the retrieval index, chat protocol, and citation surface.
 *
 * The on-disk shape lives in `data/index.json`, produced by `scripts/index.ts`.
 * We keep these types intentionally narrow so the IDE catches drift between
 * the indexer and the runtime ranker.
 */

export type Category = "research" | "people" | "pages";

export type Chunk = {
  id: string;
  url: string;
  category: Category;
  title: string;
  authors: string[];
  publishedAt: string | null;
  topics: string[];
  description: string;
  section: string | null;
  text: string;
  tokens: string[];
};

export type CatalogEntry = {
  url: string;
  category: Category;
  slug: string;
  title: string;
  description: string;
  authors: string[];
  publishedAt: string | null;
  topics: string[];
  wordCount: number;
  /** Series tag, e.g. "Better Futures" or "Design sketches". Null when the
   * piece doesn't belong to a series. */
  series?: { title: string; slug: string | null } | string | null;
};

export type IndexFile = {
  version: number;
  builtAt: string;
  counts: {
    records: number;
    chunks: number;
    avgTokensPerChunk: number;
  };
  idf: Record<string, number>;
  chunks: Chunk[];
  catalog: CatalogEntry[];
};

export type RetrievedChunk = {
  chunk: Chunk;
  score: number;
};

/**
 * The transport contract between the chat UI and `/api/chat`.
 * History is plain text — no client-side citation state to round-trip.
 */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
};

/**
 * Server-Sent-Events the API streams back, encoded one-per-line as JSON
 * (NDJSON). Three kinds:
 *   - `sources` arrives once, before any tokens, listing the cited chunks.
 *   - `delta` arrives many times with assistant text fragments.
 *   - `done` arrives exactly once at the end (no payload).
 *   - `error` may replace any of the above on failure.
 */
export type StreamEvent =
  | { type: "sources"; sources: SourceCard[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type SourceCard = {
  /** 1-based citation marker the model uses inline as `[N]`. */
  marker: number;
  url: string;
  title: string;
  category: Category;
  authors: string[];
  publishedAt: string | null;
  section: string | null;
  /** The retrieved snippet — handy for hover previews and "show passage". */
  snippet: string;
};
