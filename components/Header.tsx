import { Quill } from "./icons";

export function Header() {
  return (
    <header className="border-b border-[var(--color-rule-soft)]/70 bg-[var(--color-paper)]/85 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[var(--color-ink)]">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--color-coral-tint)] text-[var(--color-coral-deep)]">
            <Quill className="w-4 h-4" />
          </span>
          <span
            className="text-[18px] tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              letterSpacing: "-0.015em",
            }}
          >
            Forethought<span className="text-[var(--color-coral)]">.</span>chat
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-[13.5px] text-[var(--color-ink-muted)]">
          <a
            href="https://www.forethought.org/research"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-ink)] transition-colors"
          >
            Research catalog
          </a>
          <a
            href="https://www.forethought.org/about"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-ink)] transition-colors"
          >
            About Forethought
          </a>
          <a
            href="https://www.forethought.org/subscribe#podcast"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-ink)] transition-colors"
          >
            ForeCast podcast
          </a>
        </nav>
      </div>
    </header>
  );
}
