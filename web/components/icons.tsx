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

/**
 * Forethought's icon mark, extracted from their official wordmark SVG so
 * the brand sits exactly as on forethought.org. Inlined as JSX so the path
 * picks up `currentColor` from the parent — letting hover/dark-mode
 * states recolour the mark without swapping assets.
 */
export function ForethoughtMark({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 90 133"
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M49.94,72.66l-3.97,2.88,27.63,9.52v-2.16l-23.65-10.24ZM32.81,85.05l40.78,6.74v-1.83l-35.88-8.45-4.9,3.54ZM59.27,65.91l-3.57,2.59,17.89,9.34v-2.84l-14.32-9.08ZM47.51,58.45l-5.52-3.51-4.67,3.97,5.82,3.04-6.32,5.04-5.96-2.58-4.96,4.22,6.19,2.13-9.12,7.28-10.5-2.47,8.88-7.54h0s6.03-5.13,6.03-5.13l.14-.12,19.68-16.73h0s26.39-22.43,26.39-22.43v-14.11L31.73,48.45l-4.08-2.61-5.37,5.21,4.26,2.22-6.79,6.31-7.53-3.26,7.05-6.84h0s5.59-5.42,5.59-5.42l.3-.29,14.52-14.08h0S62.49,7.58,62.49,7.58h-15.57l-29.58,31.72-1.63-1.03-3.43-2.19s2.04-2.45,2.6-3.13L35.97,7.58h-14.17L0,37.13v2.29l11.6,6.06L0,57.91v1.79l14.34,4.93L0,77.91v1.76l17.38,2.82L0,96.32v.62h73.59v-1.38l-57.77-2.69,10.26-7.42h0s6.96-5.04,6.96-5.04h0l.21-.15,12.82-9.28h0l.3-.22,21.12-15.28,6.1-4.42v-13.42l-26.08,20.8Z" />
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
