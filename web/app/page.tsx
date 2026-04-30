import { Chat } from "@/components/Chat";
import { Header } from "@/components/Header";
import { corpusStats, getCatalog } from "@/lib/search";

export const revalidate = 3600;

/**
 * Pre-fetch the catalog snapshot and corpus stats so the welcome screen
 * paints with real numbers + recent papers on first byte (instead of the
 * placeholder "97 sources / 554k words" → flash → real data sequence).
 */
export default async function Home() {
  const [catalog, stats] = await Promise.all([getCatalog(), corpusStats()]);

  // Compute the small derived shapes the Chat component needs. Doing this
  // server-side keeps the client bundle lean and the first paint accurate.
  const topicCounts = new Map<string, number>();
  for (const entry of catalog) {
    for (const t of entry.topics ?? []) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const topics = [...topicCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <div className="min-h-dvh">
      <a
        href="#composer"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-[var(--color-ink)] focus:text-[var(--color-paper)] focus:px-3 focus:py-1 focus:text-sm"
      >
        Skip to chat input
      </a>
      <Header />
      <main className="relative" aria-label="Forethought chat">
        <Chat
          initialCatalog={catalog}
          initialStats={stats}
          initialTopics={topics}
        />
      </main>
    </div>
  );
}
