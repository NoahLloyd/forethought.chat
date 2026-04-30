import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://forethought.chat"),
  title: {
    default: "Forethought.chat · converse with Forethought's research",
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
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/*
          Newsreader approximates Klim's Signifier (forethought.org's
          serif); DM Sans approximates TypeType's TT Hoves. Both are
          paid foundry fonts on the real site; swap if licensed.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
