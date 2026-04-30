"use client";

import { useEffect, useRef } from "react";

/**
 * Client-side incremental search over the SSR'd /browse list.
 *
 * The whole catalog renders on the server (so it's crawlable / accessible
 * with JS off). We only attach a filter on top: type → DOM walk → toggle
 * `data-hidden` on matching items. Section headings hide themselves when
 * all of their children are filtered out.
 */
export function BrowseFilter() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    let raf = 0;
    function applyFilter() {
      const q = (input?.value ?? "").trim().toLowerCase();
      const sections = document.querySelectorAll<HTMLElement>(
        "[data-browse-section]",
      );
      sections.forEach((section) => {
        const items = section.querySelectorAll<HTMLElement>(
          "[data-browse-item]",
        );
        let visible = 0;
        items.forEach((item) => {
          const haystack = item.dataset.search ?? "";
          const match = q.length === 0 || haystack.includes(q);
          item.style.display = match ? "" : "none";
          if (match) visible += 1;
        });
        section.style.display = visible === 0 ? "none" : "";
      });

      // Update the count chip.
      const countEl = document.getElementById("browse-filter-count");
      if (countEl) {
        const total = document.querySelectorAll("[data-browse-item]").length;
        const visibleTotal = document.querySelectorAll<HTMLElement>(
          "[data-browse-item]",
        );
        let shown = 0;
        visibleTotal.forEach((el) => {
          if (el.style.display !== "none") shown += 1;
        });
        countEl.textContent =
          q.length === 0
            ? `${total} pieces`
            : `${shown} of ${total} pieces match`;
      }
    }

    function onInput() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applyFilter);
    }

    function onKey(e: KeyboardEvent) {
      // "/" focuses the filter unless the user is already in a textarea/input.
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input?.focus();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input!.value = "";
        applyFilter();
      }
    }

    input.addEventListener("input", onInput);
    window.addEventListener("keydown", onKey);
    return () => {
      input.removeEventListener("input", onInput);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="mb-6 sticky top-[60px] z-20 -mx-2 px-2 py-3 bg-[var(--color-paper)]/85 backdrop-blur-sm">
      <div className="relative max-w-[480px]">
        <input
          ref={inputRef}
          type="search"
          placeholder="Filter by title, author, or topic… (press / to focus)"
          aria-label="Filter the corpus"
          className="block w-full px-3.5 py-2 pr-12 rounded-[10px] border border-[var(--color-rule)] bg-[var(--color-paper-soft)] text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-coral)] focus:bg-[var(--color-paper)] transition-colors"
          style={{ fontFamily: "var(--font-sans)" }}
        />
        <kbd
          className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10.5px] text-[var(--color-ink-faint)] bg-[var(--color-paper-deep)] border border-[var(--color-rule-soft)] rounded"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          /
        </kbd>
      </div>
      <div
        id="browse-filter-count"
        className="mt-1.5 text-[11.5px] text-[var(--color-ink-faint)]"
        style={{ fontFamily: "var(--font-sans)" }}
      />
    </div>
  );
}
