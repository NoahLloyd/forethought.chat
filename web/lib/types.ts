/**
 * Type re-exports so existing `@/lib/types` imports keep working after the
 * agent package extraction. Canonical definitions live in @forethought/agent.
 */
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
} from "@forethought/agent";

// Backward-compat alias: the prior name for AgentEvent.
export type { AgentEvent as StreamEvent } from "@forethought/agent";
