"use client";

import type { SourceCard } from "@/lib/types";
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
          Sources · {unique.length}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {unique.map((s) => {
          const date = fmtDate(s.publishedAt);
          const isPerson = s.category === "people";
          return (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-card group block rounded-[10px] border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/60 px-3.5 py-3 text-[13.5px] leading-snug"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                {s.markers.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-medium text-[var(--color-coral-deep)] bg-[var(--color-coral-tint)]"
                    style={{ fontFamily: "var(--font-mono)" }}
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
                <span className="ml-auto text-[var(--color-ink-faint)] opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3 h-3" />
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
              <div className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
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
            </a>
          );
        })}
      </div>
    </div>
  );
}
