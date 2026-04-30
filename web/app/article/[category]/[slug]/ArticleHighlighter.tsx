"use client";

import { useEffect } from "react";

/**
 * When the reader is opened from a citation (`?cite=<snippet>`), find the
 * passage in the article body, scroll it into view, and pulse a coral
 * highlight. Cleaner than a CSS-only `:target` because we get to do
 * fuzzy-prefix matching against the actual prose.
 */
export function ArticleHighlighter() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cite = params.get("cite");
    if (!cite) return;

    const body = document.getElementById("article-body");
    if (!body) return;

    // Match against the first ~10 words of the snippet — long enough to be
    // unambiguous, short enough to survive minor formatting differences
    // between the scraped JSON and the rendered Markdown.
    const needleWords = cite
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .slice(0, 10);
    if (needleWords.length < 3) return;
    const needle = needleWords.join(" ").toLowerCase();

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = node.textContent ?? "";
      const idx = text.toLowerCase().indexOf(needle);
      if (idx !== -1) {
        highlightRange(node as Text, idx, needle.length);
        return;
      }
      node = walker.nextNode();
    }
  }, []);

  return null;
}

function highlightRange(textNode: Text, start: number, length: number) {
  const text = textNode.textContent ?? "";
  const before = text.slice(0, start);
  const match = text.slice(start, start + length);
  const after = text.slice(start + length);

  const parent = textNode.parentNode;
  if (!parent) return;

  const mark = document.createElement("mark");
  mark.className = "cite-target";
  mark.textContent = match;

  const beforeNode = document.createTextNode(before);
  const afterNode = document.createTextNode(after);
  parent.insertBefore(beforeNode, textNode);
  parent.insertBefore(mark, textNode);
  parent.insertBefore(afterNode, textNode);
  parent.removeChild(textNode);

  mark.scrollIntoView({ behavior: "smooth", block: "center" });
}
