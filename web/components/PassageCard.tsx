import type { SourceCard } from "@/lib/types";
import { cleanSnippet, externalUrlWithFragment } from "@/lib/article-link";

type Passage = { marker: number; snippet: string };

type Props = {
  source: Pick<
    SourceCard,
    "url" | "title" | "category" | "authors" | "publishedAt" | "source"
  >;
  passages: Passage[];
  placement?: "below" | "above";
};

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};

/**
 * Hover card that surfaces exactly which passages from a source the model
 * used. Identical visual surface whether triggered from a citation chip in
 * the prose or from a source card in the bottom panel. Each passage row
 * is its own link; clicking it opens forethought.org with a Chrome text
 * fragment that scrolls to and highlights that exact passage.
 */
export function PassageCard({
  source,
  passages,
  placement = "below",
}: Props) {
  const date = formatDate(source.publishedAt);
  const cat = source.category === "people" ? "Person" : source.category;

  return (
    <span
      className={`passage-card place-${placement}`}
      role="tooltip"
      aria-hidden
    >
      <span className="passage-card-meta">
        <span className="passage-card-cat">{cat}</span>
        {date ? <span>{date}</span> : null}
      </span>
      <span className="passage-card-title">{source.title}</span>
      {source.authors.length > 0 ? (
        <span className="passage-card-authors">
          {source.authors.join(", ")}
        </span>
      ) : null}
      {passages.length > 0 ? (
        <span className="passage-card-passages">
          {passages.map((p) => {
            const cleaned = cleanSnippet(p.snippet);
            const href = externalUrlWithFragment(
              source.url,
              p.snippet,
              source.source,
            );
            return (
              <a
                key={p.marker}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="passage-card-passage"
                aria-label={`Open passage ${p.marker} on forethought.org`}
              >
                <span className="passage-card-marker">{p.marker}</span>
                <span className="passage-card-snippet">
                  &ldquo;{cleaned}&rdquo;
                </span>
              </a>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}
