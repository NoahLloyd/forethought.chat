import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://forethought.chat"),
  title: {
    default: "Forethought.chat — converse with Forethought's research",
    template: "%s · Forethought.chat",
  },
  description:
    "An unofficial chat companion for the public writing of Forethought, the Oxford research nonprofit studying the transition to advanced AI.",
  openGraph: {
    title: "Forethought.chat",
    description:
      "Converse with Forethought's research, essays, and team writing.",
    url: "https://forethought.chat",
    siteName: "Forethought.chat",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Forethought.chat",
    description:
      "Converse with Forethought's research, essays, and team writing.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          Webfonts: Source Serif 4 + JetBrains Mono are open-licensed
          alternates for Anthropic's Tiempos / Söhne pairings. Preconnect
          first to keep first-paint snappy.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,300..700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
