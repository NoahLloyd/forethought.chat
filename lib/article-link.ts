/**
 * URL helpers for citations.
 *
 * Two surfaces:
 *   - `internalPathForUrl(url)` maps a forethought.org URL into our in-app
 *     reader at `/article/<category>/<slug>` so a citation can open the
 *     piece without leaving the chat.
 *   - `externalUrlWithFragment(url, snippet)` appends a Chrome/Edge text
 *     fragment so when the user *does* click through to forethought.org
 *     the browser scrolls to and highlights the cited passage.
 */

const FT_HOSTS = new Set(["www.forethought.org", "forethought.org"]);

export type InternalArticleRef = {
  category: "research" | "people" | "pages";
  slug: string;
  path: string;
};

export function internalRefForUrl(url: string): InternalArticleRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!FT_HOSTS.has(u.hostname)) return null;

  const segments = u.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { category: "pages", slug: "index", path: "/article/pages/index" };
  }
  if (segments[0] === "research" && segments[1]) {
    return {
      category: "research",
      slug: segments[1],
      path: `/article/research/${segments[1]}`,
    };
  }
  if (segments[0] === "people" && segments[1]) {
    return {
      category: "people",
      slug: segments[1],
      path: `/article/people/${segments[1]}`,
    };
  }
  if (segments.length === 1) {
    return {
      category: "pages",
      slug: segments[0],
      path: `/article/pages/${segments[0]}`,
    };
  }
  return null;
}

export function internalPathForUrl(url: string): string | null {
  return internalRefForUrl(url)?.path ?? null;
}

/**
 * Turn a snippet into a `#:~:text=start[,end]` fragment that the browser
 * uses to scroll to and highlight the passage on the destination page.
 *
 * Spec: https://wicg.github.io/scroll-to-text-fragment/
 * Supported in Chrome 80+ and Edge. Degrades cleanly to a regular link
 * everywhere else.
 *
 * Why this is non-trivial: our chunks store the original markdown
 * verbatim (so the model can cite cleanly), but forethought.org renders
 * markdown into HTML so the *DOM text* on the destination page has none
 * of the markers (`# `, `**`, `[^1]:`, `[link](url)`). A naive fragment
 * built from the raw snippet rarely matches. We:
 *   1. Strip markdown via `cleanSnippet` so the search string looks like
 *      what the user actually sees on the page.
 *   2. Emit *several* candidate fragments separated by `&text=` so the
 *      browser tries each independently. If candidate A spans a heading
 *      boundary, candidate B (taken from a mid-snippet sentence) often
 *      still hits.
 */
export function externalUrlWithFragment(
  url: string,
  snippet?: string | null,
  source?: "abstract" | "body",
): string {
  if (!snippet) return url;

  // Forethought's article pages render the body sections as visible HTML
  // but store the *abstract* only inside meta tags and the
  // `__NEXT_DATA__` JSON blob. A text-fragment built from an abstract
  // chunk has no visible target to match. Skip the fragment for
  // chunks the indexer tagged as `abstract`, and as a runtime fallback
  // also skip when the snippet contains the `**Abstract.**` marker
  // (covers chunks indexed before the source field was added).
  if (source === "abstract") return url;
  if (isLikelyAbstractChunk(snippet)) return url;

  const fragment = buildTextFragment(snippet);
  if (!fragment) return url;
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    return `${url}${fragment}`;
  }
  base.hash = "";
  return base.toString() + fragment;
}

function isLikelyAbstractChunk(rawSnippet: string): boolean {
  // The scrape pipeline prepends `**Abstract.**` to the abstract
  // paragraph when assembling the body markdown. Anything containing
  // that marker in the first ~150 chars is the abstract chunk.
  const head = rawSnippet.slice(0, 150);
  if (/\*\*Abstract\.\*\*/.test(head)) return true;
  // Also catch chunks that are *just* the article title heading
  // (h1 + nothing else of substance): they yield short, low-signal
  // fragments that rarely match the rendered hero section either.
  const trimmed = rawSnippet.trim();
  if (/^#\s+\S/.test(trimmed)) {
    // Strip the heading line and see how much prose follows.
    const rest = trimmed.replace(/^#\s+[^\n]*\n+/, "").trim();
    if (rest.length < 40) return true;
  }
  return false;
}

type Candidate = { start: string; end?: string };

function buildTextFragment(rawSnippet: string): string {
  // Strip a leading section heading (e.g. `## Time lags in each feedback
  // loop\n\n`) before cleaning, so our candidate phrases come from the
  // prose underneath rather than the heading text. The heading is in
  // the rendered DOM as a separate element; matching across the
  // heading→paragraph boundary is fragile.
  const withoutLeadingHeading = rawSnippet.replace(
    /^\s*#{1,6}\s+[^\n]*\n+/,
    "",
  );
  const cleaned = cleanSnippet(withoutLeadingHeading || rawSnippet);
  if (cleaned.length < 12) return "";

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Build a small set of candidate text-fragment selectors. Each is an
  // independent attempt; the browser highlights whichever match.
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const addStart = (text: string, n: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 3) return;
    const phrase = words.slice(0, Math.min(n, words.length)).join(" ");
    if (phrase.length < 10) return;
    if (seen.has(phrase)) return;
    seen.add(phrase);
    candidates.push({ start: phrase });
  };

  // Candidate 1: the first long-enough sentence (skips short heading
  // sentences like "Abstract." or the bare article title).
  for (const sent of sentences) {
    if (sent.length >= 30 && sent.length <= 220) {
      addStart(sent, 8);
      break;
    }
  }

  // Candidate 2: the second sentence; usually mid-prose even when the
  // first was a heading or abstract label.
  if (sentences.length >= 2) addStart(sentences[1], 7);

  // Candidate 3: the longest sentence in the snippet, which carries the
  // most distinctive vocabulary and is least likely to clash with page
  // chrome (nav, sidebar, related-pieces cards).
  const longest = sentences.slice().sort((a, b) => b.length - a.length)[0];
  if (longest) addStart(longest, 8);

  // Candidate 4: a start..end pair from the whole cleaned snippet,
  // skipping the first 2 words (often heading remnants) for the start.
  const allWords = cleaned.split(/\s+/).filter(Boolean);
  if (allWords.length >= 14) {
    const startSlice = allWords.slice(2, Math.min(allWords.length, 9));
    const endSlice = allWords.slice(-5);
    if (startSlice.length >= 4 && endSlice.length >= 3) {
      const start = startSlice.join(" ");
      const end = endSlice.join(" ");
      const key = `${start}|${end}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({ start, end });
      }
    }
  }

  if (candidates.length === 0) {
    // Last resort: first 6 words of the cleaned snippet.
    addStart(cleaned, 6);
    if (candidates.length === 0) return "";
  }

  const limited = candidates.slice(0, 4);

  const directives = limited
    .map((c) => {
      const enc = encodeFragmentText(c.start);
      if (!enc) return null;
      if (c.end) {
        const encEnd = encodeFragmentText(c.end);
        if (encEnd) return `text=${enc},${encEnd}`;
      }
      return `text=${enc}`;
    })
    .filter((d): d is string => Boolean(d));

  if (directives.length === 0) return "";
  return `#:~:${directives.join("&")}`;
}

/**
 * The text-fragment spec defines a small set of reserved characters
 * (`&,-`) that need percent-encoding even though they're URL-safe.
 * Spaces use `%20` rather than `+` per the spec. Smart quotes are kept
 * as-is so the encoded UTF-8 bytes match the page text byte-for-byte.
 */
function encodeFragmentText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return encodeURIComponent(trimmed)
    .replace(/-/g, "%2D")
    .replace(/&/g, "%26");
}

/**
 * Build a query-string suffix that the in-app article reader uses to
 * scroll to and highlight the cited passage. We pass the snippet (truncated)
 * because the reader doesn't have access to the full chunk text otherwise.
 */
export function readerHighlightParams(snippet?: string | null): string {
  if (!snippet) return "";
  const cleaned = snippet.trim().replace(/\s+/g, " ").slice(0, 240);
  if (cleaned.length < 8) return "";
  return `?cite=${encodeURIComponent(cleaned)}`;
}

/**
 * Strip markdown formatting from a chunk snippet so it reads as plain prose
 * inside hover cards and source previews. Indexer chunks preserve the
 * original markdown (handy for the model to cite verbatim) but ugly when
 * rendered in a tiny preview surface.
 */
export function cleanSnippet(s: string): string {
  if (!s) return "";
  return s
    // Fenced code blocks first (greedy strip).
    .replace(/```[\s\S]*?```/g, "")
    // Footnote definitions and inline footnote markers.
    .replace(/\[\^[^\]]+\]:?/g, "")
    // Images: well-formed `![alt](src)` and the truncated form
    // `![alt text…` (chunks often cut mid-image because they're 280
    // chars long). Drop both: alt text isn't in the rendered DOM.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\n\]]*\]?(?:\([^\n)]*\)?)?/g, "")
    // Links: keep label, drop url.
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Headings (any line that starts with #).
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // Blockquote markers.
    .replace(/^\s{0,3}>+\s?/gm, "")
    // Horizontal rules.
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    // Markdown table separator rows (`| --- | --- |`) and the leading
    // pipes on table data rows (we still keep the cell text).
    .replace(/^\s*\|?[\s:-]+\|[\s:|-]*$/gm, "")
    .replace(/^\s*\|/gm, "")
    .replace(/\|\s*$/gm, "")
    .replace(/\s*\|\s*/g, " ")
    // List bullets at line starts.
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Bold then italic. Order matters to avoid eating bold's stars.
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Strikethrough.
    .replace(/~~(.*?)~~/g, "$1")
    // Inline code.
    .replace(/`([^`]+)`/g, "$1")
    // Markdown-escaped punctuation: `\-`, `\*`, `\_`, `\[`, etc. The
    // rendered HTML drops the backslash, so our search string has to
    // do the same to match the visible page text.
    .replace(/\\([\-_*\[\]()`~#+.!])/g, "$1")
    // Collapse whitespace and newlines.
    .replace(/\s+/g, " ")
    .trim();
}
