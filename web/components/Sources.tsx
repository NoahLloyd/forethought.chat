"use client";

import Link from "next/link";
import type { SourceCard } from "@/lib/types";
import {
  externalUrlWithFragment,
  internalPathForUrl,
  readerHighlightParams,
} from "@/lib/article-link";
import { ExternalLink } from "./icons";

const fmtDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export function Sources({ sources }: { sources: SourceCard[] }) {
  if (sources.length === 0) return null;

  // Collapse multiple chunks of the same article into one card; keep their
  // citation markers grouped so the user can see how many passages it
  // contributed.
  const unique: Array<SourceCard & { markers: number[] }> = [];
  for (const s of sources) {
    const existing = unique.find((u) => u.url === s.url);
    if (existing) {
      existing.markers.push(s.marker);
      continue;
    }
    unique.push({ ...s, markers: [s.marker] });
  }

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <span
          className="uppercase text-[11px] tracking-[0.16em] text-[var(--color-ink-faint)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Sources &middot; {unique.length}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {unique.map((s) => {
          const date = fmtDate(s.publishedAt);
          const isPerson = s.category === "people";
          const internalPath = internalPathForUrl(s.url);
          const readerHref = internalPath
            ? `${internalPath}${readerHighlightParams(s.snippet)}`
            : null;
          const externalHref = externalUrlWithFragment(s.url, s.snippet);

          // Card is internal Link when we have a reader path, else open
          // straight to forethought.org with a text fragment.
          const cardChildren = (
            <>
              <div className="flex items-center gap-1.5 mb-1.5">
                {s.markers.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-medium text-[var(--color-coral-deep)] bg-[var(--color-coral-tint)]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {n}
                  </span>
                ))}
                <span
                  className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {isPerson ? "Person" : s.category}
                </span>
              </div>
              <div
                className="text-[var(--color-ink)] leading-snug"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                }}
              >
                {s.title}
              </div>
              <div
                className="mt-1 text-[12px] text-[var(--color-ink-muted)]"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {s.authors.length > 0 ? s.authors.join(", ") : null}
                {s.authors.length > 0 && date ? " · " : null}
                {date}
                {s.section ? (
                  <span className="text-[var(--color-ink-faint)]">
                    {" · "}
                    {s.section}
                  </span>
                ) : null}
              </div>
              {s.snippet ? (
                <div
                  className="mt-2 text-[12.5px] leading-snug text-[var(--color-ink-muted)] line-clamp-3"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {s.snippet}
                </div>
              ) : null}
            </>
          );

          const cardClass =
            "source-card block rounded-[10px] border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/60 px-3.5 py-3 text-[13.5px] leading-snug";

          return (
            <div key={s.url} className="group relative">
              {readerHref ? (
                <Link
                  href={readerHref}
                  data-source-url={s.url}
                  className={cardClass}
                >
                  {cardChildren}
                </Link>
              ) : (
                <a
                  href={externalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-source-url={s.url}
                  className={cardClass}
                >
                  {cardChildren}
                </a>
              )}
              {/* Secondary link to forethought.org with text-fragment highlight,
                  visible on hover so the in-app reader stays the default. */}
              <a
                href={externalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-[var(--color-ink-faint)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-coral-deep)] transition-opacity bg-[var(--color-paper)] border border-[var(--color-rule)]"
                style={{ fontFamily: "var(--font-sans)" }}
                aria-label="Open original on forethought.org"
              >
                source
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
