"use client";

import type { SourceCard } from "@/lib/types";
import { externalUrlWithFragment } from "@/lib/article-link";
import { PassageCard } from "./PassageCard";

const fmtDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};

export function Sources({ sources }: { sources: SourceCard[] }) {
  if (sources.length === 0) return null;

  // Collapse multiple chunks of the same article into one row; keep the
  // citation markers so the user can see how many passages contributed.
  type Grouped = SourceCard & {
    markers: number[];
    snippets: Array<{ marker: number; snippet: string }>;
  };
  const unique: Grouped[] = [];
  for (const s of sources) {
    const existing = unique.find((u) => u.url === s.url);
    if (existing) {
      existing.markers.push(s.marker);
      if (s.snippet) {
        existing.snippets.push({ marker: s.marker, snippet: s.snippet });
      }
      continue;
    }
    unique.push({
      ...s,
      markers: [s.marker],
      snippets: s.snippet ? [{ marker: s.marker, snippet: s.snippet }] : [],
    });
  }

  // Lightweight footnote-style list: hairline-divided rows, no boxes, no
  // background fills. The hover card carries the rich preview when the
  // user wants to peek at the actual passages.
  return (
    <div className="mt-7">
      <div
        className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-2"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        Sources &middot; {unique.length}
      </div>
      <ul>
        {unique.map((s, i) => {
          const date = fmtDate(s.publishedAt);
          const href = externalUrlWithFragment(
            s.url,
            s.snippets[0]?.snippet ?? null,
            s.source,
          );
          return (
            <li
              key={s.url}
              className={
                i > 0 ? "border-t border-[var(--color-rule-soft)]" : ""
              }
            >
              <span className="passage-anchor block">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-source-url={s.url}
                  className="source-row group flex items-baseline gap-3 py-2 transition-colors"
                >
                  <span className="inline-flex items-center gap-1 shrink-0 pt-[2px]">
                    {s.markers.map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded text-[10px] text-[var(--color-ink-muted)] border border-[color-mix(in_oklab,var(--color-ink)_25%,transparent)] group-hover:text-[var(--color-ink)] group-hover:border-[color-mix(in_oklab,var(--color-ink)_60%,transparent)] transition-colors"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 500,
                        }}
                      >
                        {n}
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[13.5px] text-[var(--color-ink)] leading-snug truncate group-hover:text-[var(--color-coral-deep)] transition-colors"
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      {s.title}
                    </span>
                    <span
                      className="block text-[11px] text-[var(--color-ink-faint)] mt-0.5 truncate"
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      {s.authors.length > 0
                        ? s.authors.join(", ")
                        : s.category === "people"
                          ? "Person"
                          : s.category}
                      {date ? ` · ${date}` : null}
                    </span>
                  </span>
                </a>
                <PassageCard
                  source={s}
                  passages={s.snippets}
                  placement="above"
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
