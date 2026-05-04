import Link from "next/link";
import { ForethoughtMark } from "./icons";

export function Header() {
  return (
    <header className="border-b border-[var(--color-rule-soft)]/70 bg-[var(--color-paper)]/85 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[760px] mx-auto px-6 h-[60px] flex items-center justify-between">
        <Link
          href="/"
          aria-label="Forethought.chat: back to chat"
          className="inline-flex items-center gap-[1px] text-[var(--color-ink)] hover:text-[var(--color-coral-deep)] transition-colors"
          style={{ lineHeight: 1, fontFamily: "var(--font-display)", fontSize: "24px" }}
        >
          <ForethoughtMark
            style={{ height: "1cap", width: "auto" }}
            aria-hidden
          />
          <span
            style={{
              fontWeight: 400,
              letterSpacing: "-0.012em",
              lineHeight: 1,
            }}
          >
            Forethought<span className="text-[var(--color-coral)]">.</span>chat
          </span>
          <span
            className="ml-1 inline-block translate-y-[1px] text-[12.5px] italic text-[var(--color-ink-faint)]"
            style={{
              fontFamily: "var(--font-serif)",
              letterSpacing: "0",
            }}
            aria-label="unofficial site"
          >
            unofficial
          </span>
        </Link>

        <nav
          className="flex items-center text-[13px] text-[var(--color-ink-muted)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          <a
            href="https://www.forethought.org"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 h-9 inline-flex items-center gap-1.5 rounded-full hover:bg-[var(--color-paper-soft)] hover:text-[var(--color-ink)] transition-colors"
          >
            forethought.org
            <svg
              viewBox="0 0 12 12"
              className="w-2.5 h-2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 3h6v6" />
              <path d="M3 9l6-6" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  );
}
