import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { getCatalog } from "@/lib/search";
import { BrowseFilter } from "./BrowseFilter";

export const metadata: Metadata = {
  title: "Browse — every Forethought source in one place",
  description:
    "All 90+ Forethought research papers, essays, and team profiles, grouped by topic and author.",
};

const fmtDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};

export default async function BrowsePage() {
  const catalog = await getCatalog();

  // Research grouped by topic, ordered by date desc within each topic.
  // Pieces with no topic land in "Other".
  const research = catalog.filter((c) => c.category === "research");
  const people = catalog.filter((c) => c.category === "people");

  const byTopic = new Map<string, typeof research>();
  for (const r of research) {
    const tags = r.topics.length > 0 ? r.topics : ["Other"];
    for (const t of tags) {
      const list = byTopic.get(t) ?? [];
      list.push(r);
      byTopic.set(t, list);
    }
  }
  const topicOrder = [...byTopic.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  for (const t of topicOrder) {
    byTopic
      .get(t)
      ?.sort((a, b) =>
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
      );
  }

  return (
    <div className="min-h-dvh">
      <Header />
      <main>
        <div className="max-w-[920px] mx-auto px-6 pt-12 pb-24">
          <div className="mb-8">
            <Link
              href="/"
              className="text-[12.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              &larr; back to chat
            </Link>
          </div>
          <h1
            className="text-[40px] md:text-[48px] leading-[1.05] tracking-[-0.018em] text-[var(--color-ink)] mb-3"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Browse the corpus
          </h1>
          <p
            className="text-[17px] text-[var(--color-ink-muted)] max-w-[640px] mb-12"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Every research piece, essay, and team profile that{" "}
            <a
              href="https://www.forethought.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--color-coral)] decoration-1 underline-offset-[3px]"
            >
              forethought.org
            </a>{" "}
            currently publishes — {research.length} pieces, {people.length}{" "}
            people, grouped by topic.
          </p>

          <BrowseFilter />

          <nav
            aria-label="Topics"
            className="flex flex-wrap gap-1.5 mb-14 py-2"
          >
            {topicOrder.map((t) => (
              <a
                key={t}
                href={`#${slugifyTopic(t)}`}
                className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/60 hover:border-[var(--color-coral)] text-[12.5px] text-[var(--color-ink)] transition-colors"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {t}
                <span className="text-[var(--color-ink-faint)] text-[11px]">
                  {byTopic.get(t)?.length}
                </span>
              </a>
            ))}
          </nav>

          {topicOrder.map((t) => {
            const list = byTopic.get(t) ?? [];
            return (
              <section
                key={t}
                id={slugifyTopic(t)}
                data-browse-section
                className="mb-14 scroll-mt-24"
              >
                <h2
                  className="text-[22px] tracking-[-0.012em] text-[var(--color-ink)] mb-5"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
                >
                  {t}
                  <span className="ml-2 text-[13px] text-[var(--color-ink-faint)] font-normal">
                    {list.length} {list.length === 1 ? "piece" : "pieces"}
                  </span>
                </h2>
                <ul className="border-t border-[var(--color-rule-soft)]">
                  {list.map((r) => {
                    const date = fmtDate(r.publishedAt);
                    const haystack = [
                      r.title,
                      ...r.authors,
                      ...r.topics,
                    ]
                      .join(" ")
                      .toLowerCase();
                    return (
                      <li
                        key={r.url}
                        data-browse-item
                        data-search={haystack}
                        className="border-b border-[var(--color-rule-soft)] py-3"
                      >
                        <Link
                          href={`/article/${r.category}/${r.slug}`}
                          className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-4 group"
                        >
                          <div
                            className="md:w-[100px] shrink-0 text-[11.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] md:text-right"
                            style={{ fontFamily: "var(--font-sans)" }}
                          >
                            {date ?? ""}
                          </div>
                          <div className="flex-1">
                            <div
                              className="text-[16px] leading-snug text-[var(--color-ink)] group-hover:text-[var(--color-coral-deep)] transition-colors"
                              style={{
                                fontFamily: "var(--font-serif)",
                                fontWeight: 500,
                              }}
                            >
                              {r.title}
                            </div>
                            {r.authors.length > 0 ? (
                              <div
                                className="mt-0.5 text-[12.5px] text-[var(--color-ink-muted)]"
                                style={{ fontFamily: "var(--font-sans)" }}
                              >
                                {r.authors.join(", ")}
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <section
            id="people"
            data-browse-section
            className="mb-14 scroll-mt-24"
          >
            <h2
              className="text-[22px] tracking-[-0.012em] text-[var(--color-ink)] mb-5"
              style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
            >
              People
              <span className="ml-2 text-[13px] text-[var(--color-ink-faint)] font-normal">
                {people.length}
              </span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {people
                .slice()
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((p) => {
                  const haystack = [
                    p.title,
                    p.description ?? "",
                  ]
                    .join(" ")
                    .toLowerCase();
                  return (
                    <Link
                      key={p.url}
                      href={`/article/${p.category}/${p.slug}`}
                      data-browse-item
                      data-search={haystack}
                      className="block px-3 py-2 rounded-[8px] border border-[var(--color-rule-soft)] hover:border-[var(--color-coral)] hover:bg-[var(--color-paper-soft)]/60 transition-colors"
                    >
                      <div
                        className="text-[14.5px] text-[var(--color-ink)] leading-snug"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 500,
                        }}
                      >
                        {p.title}
                      </div>
                      {p.description ? (
                        <div
                          className="mt-0.5 text-[11.5px] text-[var(--color-ink-muted)] line-clamp-1"
                          style={{ fontFamily: "var(--font-sans)" }}
                        >
                          {p.description.split("—")[0]?.trim() ||
                            p.description}
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function slugifyTopic(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
