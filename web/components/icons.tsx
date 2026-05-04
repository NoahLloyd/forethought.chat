// Tiny inline SVG icon set; keeps us off external icon libraries and lets
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
 * picks up `currentColor` from the parent, letting hover/dark-mode
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
      viewBox="0 7.58 73.59 89.36"
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

/* ---------------------------------------------------------------------
 * Provider marks. SVG paths come from Simple Icons (CC0); the brands
 * themselves remain trademarks of their respective owners. We use
 * `currentColor` instead of the brand color so the marks pick up the
 * parent text color and switch automatically with dark mode.
 * ------------------------------------------------------------------- */

export function AnthropicMark({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  );
}

export function OpenAIMark({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

export function GoogleMark({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
    </svg>
  );
}
