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
 * Server-Sent-Events the API streams back. The agent calls the search tool
 * zero or more times before answering, so events arrive interleaved:
 *   - `tool_call` fires when the agent issues a search (one per call).
 *   - `sources` fires after each search that finds new chunks; payload is
 *     the cumulative source list, sorted by citation marker.
 *   - `text` fires repeatedly with assistant prose deltas.
 *   - `done` fires once at the end with stop reason and token usage.
 *   - `error` may replace any of the above on failure.
 */
export type StreamEvent =
  | { type: "tool_call"; name: "search"; query: string }
  | { type: "sources"; sources: SourceCard[] }
  | { type: "text"; delta: string }
  | {
      type: "done";
      stopReason: string | null;
      iterations: number;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
      };
    }
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
