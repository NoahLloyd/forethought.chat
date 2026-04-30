/**
 * @forethought/agent - the chat agent package.
 *
 * Public surface:
 *   - runAgent(): framework-agnostic async generator over AgentEvent
 *   - createSearcher(): BM25 retrieval bound to a corpus index file
 *   - buildStablePreamble(), formatSearchResult(): prompt assembly
 *   - CHAT_MODEL, client(): pinned model id and lazy SDK client
 *   - all type aliases for the corpus, conversation, and event shapes
 */
export { CHAT_MODEL, client } from "./anthropic";
export { buildStablePreamble, formatSearchResult } from "./prompt";
export { createSearcher } from "./search";
export type { Searcher, SearcherOptions } from "./search";
export { runAgent } from "./iterate";
export type { RunAgentOptions } from "./iterate";
export type {
  AgentEvent,
  CatalogEntry,
  Category,
  ChatMessage,
  ChatRequest,
  Chunk,
  IndexFile,
  RetrievedChunk,
  SourceCard,
} from "./types";
