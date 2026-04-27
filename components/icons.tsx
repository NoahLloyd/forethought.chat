// Tiny inline SVG icon set — keeps us off external icon libraries and lets
// the design own its line weight, terminal style, and corner radii.

export function ArrowUp({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 13V3" />
      <path d="M3.5 7.5L8 3l4.5 4.5" />
    </svg>
  );
}

export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 8h10" />
      <path d="M8.5 3.5L13 8l-4.5 4.5" />
    </svg>
  );
}

export function Quill({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M19 4c-7 1.5-11 6.5-13 13-.4 1.4 1.6 1.6 2.8.4l1.2-1.2c2.5.8 5.5-.5 7.5-3.7C18.5 9.6 19 6 19 4z"
        fill="currentColor"
        opacity={0.18}
      />
      <path
        d="M19 4c-7 1.5-11 6.5-13 13-.4 1.4 1.6 1.6 2.8.4l1.2-1.2c2.5.8 5.5-.5 7.5-3.7C18.5 9.6 19 6 19 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path
        d="M9 15c1.5-3.5 4-6 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ExternalLink({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 3H3v8h8V9" />
      <path d="M8 3h3v3" />
      <path d="M11 3L7 7" />
    </svg>
  );
}

export function Spark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M6 0l1.2 4.8L12 6l-4.8 1.2L6 12l-1.2-4.8L0 6l4.8-1.2z" />
    </svg>
  );
}
