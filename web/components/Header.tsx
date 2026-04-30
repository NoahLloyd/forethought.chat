import Link from "next/link";
import { ForethoughtMark } from "./icons";

export function Header() {
  return (
    <header className="border-b border-[var(--color-rule-soft)]/70 bg-[var(--color-paper)]/85 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[1100px] mx-auto px-6 h-[60px] flex items-center justify-between">
        <Link
          href="/"
          aria-label="Forethought.chat — back to chat"
          className="inline-flex items-baseline gap-[7px] text-[var(--color-ink)] hover:text-[var(--color-coral-deep)] transition-colors"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: "26px",
            letterSpacing: "-0.012em",
            lineHeight: 1,
          }}
        >
          <ForethoughtMark
            className="self-end translate-y-[3px]"
            style={{ width: "0.62em", height: "1em" }}
          />
          <span>
            Forethought<span className="text-[var(--color-coral)]">.</span>chat
          </span>
        </Link>

        <nav
          className="hidden md:flex items-center gap-1 text-[13px] text-[var(--color-ink-muted)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          <Link
            href="/browse"
            className="px-3 h-9 inline-flex items-center rounded-full hover:bg-[var(--color-paper-soft)] hover:text-[var(--color-ink)] transition-colors"
          >
            Browse
          </Link>
          <Link
            href="/about"
            className="px-3 h-9 inline-flex items-center rounded-full hover:bg-[var(--color-paper-soft)] hover:text-[var(--color-ink)] transition-colors"
          >
            About
          </Link>
          <span className="mx-1 h-4 w-px bg-[var(--color-rule)]" aria-hidden />
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
