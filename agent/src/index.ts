/**
 * @forethought/agent - the chat agent's prompt + retrieval primitives.
 *
 * Public surface:
 *   - createSearcher(): BM25 retrieval bound to a corpus index file
 *   - buildStablePreamble(), formatSearchResult(): prompt assembly
 *   - CHAT_MODEL, client(): pinned model id and lazy SDK client
 *   - all type aliases for the corpus, conversation, and event shapes
 *
 * The iteration loop / provider dispatch lives in web/lib/providers; the
 * package here owns the corpus-shaped pieces that web (and any future
 * consumer) needs to hand to a provider.
 */
export { CHAT_MODEL, client } from "./anthropic";
export { buildStablePreamble, formatSearchResult } from "./prompt";
export { createSearcher } from "./search";
export type { Searcher, SearcherOptions } from "./search";
export type {
  AgentEvent,
  ArticleMention,
  CatalogEntry,
  Category,
  ChatMessage,
  ChatRequest,
  Chunk,
  IndexFile,
  RetrievedChunk,
  SourceCard,
} from "./types";
