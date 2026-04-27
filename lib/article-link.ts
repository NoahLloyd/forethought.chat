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
 * Supported in Chrome 80+ and Edge — degrades cleanly to a regular link
 * everywhere else.
 */
export function externalUrlWithFragment(
  url: string,
  snippet?: string | null,
): string {
  if (!snippet) return url;
  const cleaned = snippet
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[…\s]+|[…\s]+$/g, "");
  if (cleaned.length < 8) return url;

  const words = cleaned.split(" ");
  const startWords = words.slice(0, Math.min(8, words.length)).join(" ");
  let fragment = `#:~:text=${encodeURIComponent(startWords)}`;
  if (words.length > 18) {
    const endWords = words.slice(-6).join(" ");
    fragment = `#:~:text=${encodeURIComponent(startWords)},${encodeURIComponent(endWords)}`;
  }

  let base: URL;
  try {
    base = new URL(url);
  } catch {
    return `${url}${fragment}`;
  }
  base.hash = "";
  return base.toString() + fragment;
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
