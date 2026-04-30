/**
 * Print the chat agent's stable preamble (persona + corpus catalog) to
 * stdout. Used by the bench's CLI agent so it can reuse the EXACT system
 * prompt the production chat route uses, without forking it.
 */
import path from "node:path";

import { buildStablePreamble, createSearcher } from "@forethought/agent";

async function main(): Promise<void> {
  const indexPath =
    process.env.FORETHOUGHT_INDEX_PATH ??
    path.join(process.cwd(), "data", "index.json");
  const searcher = createSearcher({ indexPath });
  const catalog = await searcher.getCatalog();
  process.stdout.write(buildStablePreamble(catalog));
  process.stdout.write("\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`preamble.ts failed: ${msg}\n`);
  process.exit(1);
});
