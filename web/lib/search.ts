/**
 * Re-export the Searcher's bound methods so web pages and routes can keep
 * importing from "@/lib/search" unchanged. The actual BM25 implementation
 * lives in @forethought/agent.
 */
import path from "node:path";
import { createSearcher } from "@forethought/agent";

const searcher = createSearcher({
  indexPath: path.join(process.cwd(), "data", "index.json"),
});

export const search = searcher.search;
export const getCatalog = searcher.getCatalog;
export const corpusStats = searcher.corpusStats;
export const getChunk = searcher.getChunk;

export type {
  CatalogEntry,
  Chunk,
  IndexFile,
  RetrievedChunk,
} from "@forethought/agent";
