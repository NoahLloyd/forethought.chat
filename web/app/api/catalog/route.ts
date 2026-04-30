/**
 * Catalog endpoint — feeds the welcome screen and the topic browser.
 *
 * Returns the prebuilt catalog plus a small set of derived stats (counts,
 * top-level topics) so the UI doesn't have to recompute them on every load.
 * Cached aggressively — the underlying file only changes on `pnpm ingest`.
 */
import { NextResponse } from "next/server";
import { corpusStats, getCatalog } from "@/lib/search";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const [catalog, stats] = await Promise.all([getCatalog(), corpusStats()]);

  // Pull a topic histogram so the UI can show "what's covered" without
  // scanning every catalog entry on the client.
  const topicCounts = new Map<string, number>();
  for (const entry of catalog) {
    for (const t of entry.topics ?? []) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const topics = [...topicCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Author histogram is similarly cheap and useful for "who writes about Y".
  const authorCounts = new Map<string, number>();
  for (const entry of catalog) {
    if (entry.category !== "research") continue;
    for (const a of entry.authors ?? []) {
      authorCounts.set(a, (authorCounts.get(a) ?? 0) + 1);
    }
  }
  const authors = [...authorCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return NextResponse.json(
    { catalog, stats, topics, authors },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=600, stale-while-revalidate=86400",
      },
    },
  );
}
