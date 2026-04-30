import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { corpusStats } from "@/lib/search";

export const metadata: Metadata = {
  title: "About: what is Forethought.chat?",
  description:
    "An unofficial reading companion for Forethought's public writing.",
};

export const revalidate = 3600;

export default async function AboutPage() {
  const stats = await corpusStats();
  return (
    <div className="min-h-dvh">
      <Header />
      <main>
        <article className="max-w-[760px] mx-auto px-6 pt-12 pb-24">
          <h1
            className="text-[36px] md:text-[42px] leading-[1.05] tracking-[-0.012em] text-[var(--color-ink)] mb-3"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            About
          </h1>
          <p
            className="text-[15px] italic text-[var(--color-ink-muted)] mb-8"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Unofficial. Independent. Not produced or endorsed by Forethought.
          </p>

          <div
            className="prose-forethought text-[16.5px] leading-[1.7]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <p>
              Forethought.chat is a chat-shaped index over the public writing
              of{" "}
              <a
                href="https://www.forethought.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Forethought
              </a>
              , the Oxford research nonprofit on the transition to advanced
              AI. {stats.research} research pieces, {stats.people} team
              profiles, ~{Math.round(stats.totalWords / 1000)}k words.
            </p>
            <p>
              Each turn runs your question through a BM25 ranker over ~3,600
              prebuilt chunks; the top excerpts go to{" "}
              Anthropic&rsquo;s Claude with a stable persona and the corpus
              catalog. Every claim is grounded in a numbered citation back to
              the source.
            </p>
            <p>
              The corpus is a snapshot, not a live mirror. Newly published
              pieces aren&rsquo;t in the retrieval pool until the index is
              rebuilt. Verify load-bearing claims against the linked sources.
            </p>

            <h2>Feedback</h2>
            <p>
              Bugs or suggestions:{" "}
              <a href="mailto:n@noahlr.com">n@noahlr.com</a>.
            </p>
          </div>

          <div className="mt-10 pt-5 border-t border-[var(--color-rule-soft)] flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[var(--color-ink-muted)]"
               style={{ fontFamily: "var(--font-sans)" }}>
            <Link
              href="/"
              className="inline-flex items-center gap-1 hover:text-[var(--color-coral-deep)] transition-colors"
            >
              &larr; back to chat
            </Link>
            <a
              href="https://www.forethought.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--color-coral-deep)] transition-colors"
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
          </div>
        </article>
      </main>
    </div>
  );
}
