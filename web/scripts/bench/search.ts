/**
 * CLI wrapper around the Forethought corpus searcher, used by the bench's
 * subscription-billed CLI agent.
 *
 * Why this exists: bench/forethought_bench/agents/claude_cli.py spawns
 * `claude -p` (subscription-billed) and gives it a single Bash tool that
 * invokes this script. That keeps retrieval identical to production
 * (`@forethought/agent`'s createSearcher) without porting BM25 to Python.
 *
 * Marker stability: claude -p calls this script several times per question.
 * Each invocation reads the JSONL sources file at $BENCH_SOURCES_OUT, looks
 * up whether each result chunk has already been assigned a marker, and
 * either reuses that marker or appends a new (chunk, marker) record. The
 * marker the model sees as `[N]` is therefore stable across searches
 * within one bench item.
 *
 * Args:
 *   --query <string>        the search query (required)
 *   --k <int>               number of excerpts (default 6, max 10)
 *   --sources-out <path>    JSONL file to read+append source records
 *                           (required; env BENCH_SOURCES_OUT also accepted)
 *   --index-path <path>     override path to data/index.json
 *                           (default: $FORETHOUGHT_INDEX_PATH or web/data/index.json)
 */
import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createSearcher, formatSearchResult } from "@forethought/agent";

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

type SourceRecord = {
  marker: number;
  chunk_id: string;
  url: string;
  title: string;
  category: string;
  authors: string[];
  publishedAt: string | null;
  section: string | null;
  snippet: string;
  source?: string;
};

async function readExistingMarkers(
  sourcesOut: string,
): Promise<{ byId: Map<string, number>; maxMarker: number }> {
  const byId = new Map<string, number>();
  let maxMarker = 0;
  if (!existsSync(sourcesOut)) return { byId, maxMarker };
  const raw = await readFile(sourcesOut, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: Partial<SourceRecord>;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof rec.chunk_id !== "string" || typeof rec.marker !== "number")
      continue;
    byId.set(rec.chunk_id, rec.marker);
    if (rec.marker > maxMarker) maxMarker = rec.marker;
  }
  return { byId, maxMarker };
}

function snippet(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const window = cleaned.slice(0, max + 80);
  const cutoff = window.lastIndexOf(". ");
  if (cutoff > max - 80 && cutoff < max + 80) return window.slice(0, cutoff + 1);
  return cleaned.slice(0, max).trimEnd() + "…";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    process.stderr.write("search.ts: --query is required\n");
    process.exit(2);
  }
  const kRaw = typeof args.k === "string" ? args.k : "6";
  const k = Math.min(Math.max(parseInt(kRaw, 10) || 6, 1), 10);
  const sourcesOut =
    (typeof args["sources-out"] === "string" ? args["sources-out"] : null) ??
    process.env.BENCH_SOURCES_OUT ??
    null;
  if (!sourcesOut) {
    process.stderr.write(
      "search.ts: --sources-out (or $BENCH_SOURCES_OUT) is required\n",
    );
    process.exit(2);
  }
  const indexPath =
    (typeof args["index-path"] === "string" ? args["index-path"] : null) ??
    process.env.FORETHOUGHT_INDEX_PATH ??
    path.join(process.cwd(), "data", "index.json");

  const searcher = createSearcher({ indexPath });
  const hits = await searcher.search(query, k);

  const { byId, maxMarker } = await readExistingMarkers(sourcesOut);
  let nextMarker = maxMarker + 1;
  const numbered: Array<{
    chunk: (typeof hits)[number]["chunk"];
    marker: number;
  }> = [];
  const newRecords: SourceRecord[] = [];
  for (const { chunk } of hits) {
    let marker = byId.get(chunk.id);
    if (marker === undefined) {
      marker = nextMarker++;
      byId.set(chunk.id, marker);
      newRecords.push({
        marker,
        chunk_id: chunk.id,
        url: chunk.url,
        title: chunk.title,
        category: chunk.category,
        authors: chunk.authors,
        publishedAt: chunk.publishedAt,
        section: chunk.section,
        snippet: snippet(chunk.text),
        source: chunk.source,
      });
    }
    numbered.push({ chunk, marker });
  }

  if (newRecords.length > 0) {
    const blob = newRecords.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await appendFile(sourcesOut, blob, "utf8");
  }

  process.stdout.write(formatSearchResult(query, numbered));
  process.stdout.write("\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`search.ts failed: ${msg}\n`);
  process.exit(1);
});
