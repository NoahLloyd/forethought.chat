import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { corpusStats } from "@/lib/search";

export const metadata: Metadata = {
  title: "About — what is Forethought.chat?",
  description:
    "An unofficial reading companion for Forethought's public writing. How it works, what it covers, and where the limits are.",
};

export const revalidate = 3600;

export default async function AboutPage() {
  const stats = await corpusStats();
  const builtAt = new Date(stats.builtAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-dvh">
      <Header />
      <main>
        <article className="max-w-[680px] mx-auto px-6 pt-12 pb-24">
          <div className="mb-8">
            <Link
              href="/"
              className="text-[12.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              &larr; back to chat
            </Link>
          </div>

          <h1
            className="text-[44px] md:text-[52px] leading-[1.05] tracking-[-0.018em] text-[var(--color-ink)] mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            What this is
          </h1>

          <div
            className="prose-forethought text-[17.5px] leading-[1.7]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <p>
              Forethought.chat is an unofficial reading companion for{" "}
              <a
                href="https://www.forethought.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Forethought
              </a>
              , the Oxford research nonprofit studying how civilisation should
              navigate the transition to advanced AI.
            </p>
            <p>
              Their public writing has grown into a substantial body of work —{" "}
              {stats.research} research pieces and counting, alongside {stats.people}{" "}
              team profiles, totalling roughly{" "}
              {Math.round(stats.totalWords / 1000)}k words. This site is a
              chat-shaped index over all of it: ask a question, and the
              assistant will retrieve the most relevant excerpts and answer
              with citations back to source.
            </p>

            <h2>How it works</h2>
            <p>
              Each turn, the question is run through a BM25 ranker over ~3,600
              prebuilt chunks of Forethought prose. The top dozen excerpts are
              passed to Anthropic's Claude (Sonnet 4.6) along with a stable
              persona prompt and the full corpus catalog. The model is asked
              to ground every claim in a numbered citation that maps back to
              the retrieved excerpt — and to say plainly when the excerpts
              don't cover what was asked.
            </p>
            <p>
              Click any citation chip to scroll to the matching source card
              under the response, or open the in-app reader for that piece
              with the cited passage highlighted. The reader keeps you in the
              app; if you want the original at forethought.org, every card and
              article header has a link.
            </p>

            <h2>What it doesn't do</h2>
            <p>
              The corpus is a snapshot, not a live mirror. It was last rebuilt{" "}
              {builtAt}. New pieces published after that date won't be in the
              retrieval pool until the index is regenerated. The Forethought
              podcast (ForeCast) is referenced from the catalog but its audio
              transcripts are not part of the searchable text.
            </p>
            <p>
              The model can still misattribute, oversimplify, or miss nuance.
              Verify load-bearing claims against the linked sources — that's
              what the citations are for.
            </p>

            <h2>Affiliation</h2>
            <p>
              This is an independent project, not produced or endorsed by
              Forethought. It exists because their writing is worth reading,
              and because a chat surface is sometimes the right way in.
            </p>
          </div>

          <div className="mt-12 pt-6 border-t border-[var(--color-rule-soft)] flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] text-[var(--color-paper)] bg-[var(--color-ink)] hover:bg-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Try the chat →
            </Link>
            <Link
              href="/browse"
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] text-[var(--color-ink-muted)] bg-[var(--color-paper-soft)] border border-[var(--color-rule)] hover:border-[var(--color-coral)] hover:text-[var(--color-ink)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Browse the corpus
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
