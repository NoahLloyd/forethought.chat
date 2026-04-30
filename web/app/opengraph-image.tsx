import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Forethought.chat · ask Forethought's research, anything.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dynamic OG image rendered at request time. Mirrors the welcome screen's
 * typography (display serif + warm cream + coral accent) so a shared link
 * reads as part of the same surface, not a generic Vercel template.
 */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(180deg, #FBFAF4 0%, #EEECE4 100%)",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#2F2A26",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "#FF6F43",
              opacity: 0.18,
            }}
          />
          <div
            style={{
              fontSize: 26,
              letterSpacing: "-0.01em",
              display: "flex",
            }}
          >
            <span>forethought</span>
            <span style={{ color: "#852204" }}>.</span>
            <span>chat</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 96,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              fontWeight: 400,
              maxWidth: 1000,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Ask Forethought&rsquo;s</span>
            <span style={{ color: "#852204", fontStyle: "italic" }}>
              research, anything.
            </span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#757371",
              maxWidth: 920,
              lineHeight: 1.35,
            }}
          >
            A chat companion for the public writing of Forethought. Every claim
            grounded in a citation back to source.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            fontSize: 20,
            color: "#97928A",
          }}
        >
          <span>unofficial &middot; powered by Claude</span>
          <span style={{ fontFamily: "Menlo, monospace" }}>
            forethought.chat
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
