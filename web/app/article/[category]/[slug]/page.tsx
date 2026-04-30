import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Header } from "@/components/Header";
import { ExternalLink } from "@/components/icons";
import { getCatalog } from "@/lib/search";
import type { CatalogEntry } from "@/lib/types";
import { ArticleHighlighter } from "./ArticleHighlighter";

type RawAuthor = string | { name: string; slug?: string | null };

type SeriesPart = { slug: string; title: string };

type SeriesInfo = {
  title: string;
  slug: string | null;
  totalParts: number;
  currentIndex: number | null;
  parts: SeriesPart[];
  overview: SeriesPart | null;
};

type Article = {
  url: string;
  category: string;
  slug: string;
  title: string;
  description: string;
  authors: string[];
  publishedAt: string | null;
  topics: string[];
  body: string;
  text: string;
  series?: SeriesInfo | { title: string; slug: string | null } | string | null;
};

function normaliseAuthors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a: RawAuthor): string =>
      typeof a === "string" ? a : (a?.name ?? ""),
    )
    .filter((s) => s.length > 0);
}

function normaliseSeries(raw: Article["series"]): SeriesInfo | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    return {
      title: raw,
      slug: null,
      totalParts: 0,
      currentIndex: null,
      parts: [],
      overview: null,
    };
  }
  if (typeof raw !== "object") return null;
  if ("parts" in raw && Array.isArray(raw.parts)) {
    return raw as SeriesInfo;
  }
  return {
    title: raw.title ?? "",
    slug: raw.slug ?? null,
    totalParts: 0,
    currentIndex: null,
    parts: [],
    overview: null,
  };
}

const ALLOWED_CATEGORIES = new Set(["research", "people", "pages"]);

// Articles change at most when the index is rebuilt (`pnpm ingest`).
// One-hour revalidate keeps the rendered HTML hot in the CDN so a user
// reading "Preparing for the Intelligence Explosion" doesn't pay the
// full markdown render on each visit.
export const revalidate = 3600;

async function loadArticle(
  category: string,
  slug: string,
): Promise<Article | null> {
  if (!ALLOWED_CATEGORIES.has(category)) return null;
  // Defensive: forbid path traversal in slug.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  const file = path.join(
    process.cwd(),
    "data",
    "content",
    `${category}__${slug}.json`,
  );
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Article & { authors: unknown };
    return { ...parsed, authors: normaliseAuthors(parsed.authors) };
  } catch {
    return null;
  }
}

const fmtDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const article = await loadArticle(category, slug);
  if (!article) return { title: "Not found" };
  return {
    title: article.title,
    description: article.description,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const article = await loadArticle(category, slug);
  if (!article) notFound();

  const date = fmtDate(article.publishedAt);
  const seriesInfo = normaliseSeries(article.series);
  const seriesTitle = seriesInfo?.title ?? null;

  return (
    <div className="min-h-dvh">
      <Header />
      <ArticleHighlighter />
      <main>
        <article className="max-w-[720px] mx-auto px-6 pt-12 pb-24">
          <div className="mb-8">
            <Link
              href="/"
              className="text-[12.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              &larr; back to chat
            </Link>
          </div>

          <div
            className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-3"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {category === "people" ? "Person" : category}
            {seriesTitle ? <span> &middot; {seriesTitle}</span> : null}
          </div>

          <h1
            className="text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.018em] text-[var(--color-ink)] mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            {article.title}
          </h1>

          {article.description ? (
            <p
              className="text-[18px] text-[var(--color-ink-muted)] leading-snug mb-6 max-w-[640px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {article.description}
            </p>
          ) : null}

          <div
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-[var(--color-ink-muted)] mb-6"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {article.authors.length > 0 ? (
              <span>{article.authors.join(", ")}</span>
            ) : null}
            {date ? <span>{date}</span> : null}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-coral-deep)] hover:underline"
            >
              read on forethought.org
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="mb-8 flex flex-wrap gap-2">
            <Link
              href={`/?q=${encodeURIComponent(`Summarise '${article.title}' in 4–6 sentences. What's the main argument?`)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] text-[var(--color-paper)] bg-[var(--color-ink)] hover:bg-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Chat about this →
            </Link>
            <Link
              href={`/?q=${encodeURIComponent(`What's the strongest objection to the argument in '${article.title}'?`)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] text-[var(--color-ink-muted)] bg-[var(--color-paper-soft)] border border-[var(--color-rule)] hover:border-[var(--color-coral)] hover:text-[var(--color-ink)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              What's the strongest objection?
            </Link>
            <Link
              href={`/?q=${encodeURIComponent(`What other Forethought pieces relate to '${article.title}'?`)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] text-[var(--color-ink-muted)] bg-[var(--color-paper-soft)] border border-[var(--color-rule)] hover:border-[var(--color-coral)] hover:text-[var(--color-ink)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Related pieces
            </Link>
          </div>

          {seriesInfo && seriesInfo.parts.length > 1 ? (
            <SeriesNav info={seriesInfo} currentSlug={slug} />
          ) : null}

          <div className="border-t border-[var(--color-rule-soft)] pt-8" />

          <div
            id="article-body"
            className="prose-forethought text-[17.5px] leading-[1.7]"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt }) => {
                  if (typeof src !== "string" || !src) return null;
                  const normalized = src.startsWith("//")
                    ? `https:${src}`
                    : src;
                  return (
                    <figure className="chat-figure">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={normalized}
                        alt={alt ?? ""}
                        loading="lazy"
                        decoding="async"
                      />
                      {alt ? <figcaption>{alt}</figcaption> : null}
                    </figure>
                  );
                },
              }}
            >
              {article.body}
            </ReactMarkdown>
          </div>

          {article.topics.length > 0 ? (
            <div className="mt-12 pt-8 border-t border-[var(--color-rule-soft)]">
              <div
                className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-3"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Topics
              </div>
              <div className="flex flex-wrap gap-1.5">
                {article.topics.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center px-2.5 py-1 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/40 text-[12.5px] text-[var(--color-ink-muted)]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {category === "research" ? (
            <RelatedSection article={article} />
          ) : null}
        </article>
      </main>
    </div>
  );
}

async function RelatedSection({ article }: { article: Article }) {
  const catalog = await getCatalog();

  // Pieces by the same author(s), excluding the current one. Stable
  // ordering by date desc.
  const sameAuthor = catalog
    .filter(
      (c) =>
        c.category === "research" &&
        c.url !== article.url &&
        c.authors.some((a) => article.authors.includes(a)),
    )
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 6);

  // Pieces sharing at least one topic, but not by the same author (so we
  // surface complementary perspectives rather than restating the author
  // section). Drop ones already in `sameAuthor`.
  const sameAuthorUrls = new Set(sameAuthor.map((c) => c.url));
  const sharedTopic = catalog
    .filter(
      (c) =>
        c.category === "research" &&
        c.url !== article.url &&
        !sameAuthorUrls.has(c.url) &&
        c.topics.some((t) => article.topics.includes(t)),
    )
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 4);

  if (sameAuthor.length === 0 && sharedTopic.length === 0) return null;

  return (
    <div className="mt-12 pt-8 border-t border-[var(--color-rule-soft)] grid md:grid-cols-2 gap-x-10 gap-y-8">
      {sameAuthor.length > 0 ? (
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-4"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            More by{" "}
            {article.authors.length === 1
              ? article.authors[0]
              : article.authors.length === 2
                ? article.authors.join(" & ")
                : `${article.authors.slice(0, -1).join(", ")} & ${article.authors.slice(-1)}`}
          </div>
          <ul className="space-y-3">
            {sameAuthor.map((c) => (
              <RelatedItem key={c.url} entry={c} />
            ))}
          </ul>
        </div>
      ) : null}
      {sharedTopic.length > 0 ? (
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-4"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            Related pieces
          </div>
          <ul className="space-y-3">
            {sharedTopic.map((c) => (
              <RelatedItem key={c.url} entry={c} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SeriesNav({
  info,
  currentSlug,
}: {
  info: SeriesInfo;
  currentSlug: string;
}) {
  return (
    <nav
      aria-label={`${info.title} — series navigation`}
      className="mt-2 mb-6 rounded-[12px] border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/50 px-5 py-4"
    >
      <div className="flex items-baseline justify-between mb-2.5">
        <div
          className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Part of a series
        </div>
        <div
          className="text-[11.5px] text-[var(--color-ink-muted)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {info.parts.length} pieces
        </div>
      </div>
      {info.overview ? (
        <Link
          href={`/article/research/${info.overview.slug}`}
          className="block text-[16px] leading-snug text-[var(--color-ink)] hover:text-[var(--color-coral-deep)] mb-3 transition-colors"
          style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
        >
          {info.title} →
        </Link>
      ) : (
        <div
          className="text-[16px] leading-snug text-[var(--color-ink)] mb-3"
          style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
        >
          {info.title}
        </div>
      )}
      <ol className="space-y-1.5">
        {info.parts.map((part, idx) => {
          const isCurrent = part.slug === currentSlug;
          return (
            <li key={part.slug} className="flex items-baseline gap-3">
              <span
                className={`shrink-0 w-5 text-[11.5px] tabular-nums ${
                  isCurrent
                    ? "text-[var(--color-coral-deep)] font-medium"
                    : "text-[var(--color-ink-faint)]"
                }`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              {isCurrent ? (
                <span
                  className="text-[14.5px] leading-snug text-[var(--color-ink)]"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 500,
                  }}
                >
                  {part.title}
                </span>
              ) : (
                <Link
                  href={`/article/research/${part.slug}`}
                  className="text-[14.5px] leading-snug text-[var(--color-ink-muted)] hover:text-[var(--color-coral-deep)] transition-colors"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {part.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function RelatedItem({ entry }: { entry: CatalogEntry }) {
  const date = entry.publishedAt
    ? new Date(entry.publishedAt).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      })
    : null;
  return (
    <li>
      <Link
        href={`/article/${entry.category}/${entry.slug}`}
        className="block group"
      >
        <div
          className="text-[15px] text-[var(--color-ink)] leading-snug group-hover:text-[var(--color-coral-deep)] transition-colors"
          style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
        >
          {entry.title}
        </div>
        <div
          className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {date ?? ""}
          {entry.authors.length > 0 && date ? " · " : ""}
          {entry.authors.length > 0 ? entry.authors.join(", ") : ""}
        </div>
      </Link>
    </li>
  );
}
