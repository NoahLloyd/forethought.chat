# Forethought.chat

An unofficial chat companion for the public writing of [Forethought](https://www.forethought.org), the Oxford research nonprofit studying the transition to advanced AI.

Built with Next.js 15, Tailwind 4, TypeScript, and the Anthropic SDK. Retrieval is BM25 over a prebuilt chunk index; the system prompt embeds the catalog and uses Anthropic's prompt cache so multi-turn sessions stay cheap.

## Quick start

```bash
pnpm install
cp .env.example .env.local
#   ANTHROPIC_API_KEY=sk-ant-…
pnpm ingest          # scrape forethought.org and build the BM25 index
pnpm dev             # http://localhost:3000
```

`pnpm ingest` is the one-shot pipeline: it pulls every URL in the public sitemap, extracts the structured CMS body, splits each piece into ~800-char chunks, and writes a single `data/index.json` (~10 MB, BM25 ready). Cached HTML lives under `data/raw/` so re-running is instant unless you pass `--refresh`.

## Layout

```
app/
  page.tsx                                # welcome + chat
  browse/page.tsx                         # full corpus grouped by topic
  article/[category]/[slug]/page.tsx      # in-app reader for each source
  api/chat/route.ts                       # streaming chat endpoint (SSE)
  api/catalog/route.ts                    # snapshot for the welcome screen
  sitemap.ts, robots.ts                   # SEO surfaces
components/                                # Chat / Message / Sources / Header / icons
lib/
  anthropic.ts                            # Anthropic client, model id (claude-sonnet-4-6)
  search.ts                               # BM25 retrieval with bibliography penalty + people boost
  prompt.ts                               # persona + catalog + excerpt formatting
  article-link.ts                         # citation → in-app reader URL helpers
  types.ts                                # shared shapes (Chunk, SourceCard, …)
scripts/
  scrape.ts                               # forethought.org → data/content/*.json
  index.ts                                # data/content/* → data/index.json
data/
  raw/                                    # cached HTML (not committed)
  content/                                # one JSON record per page (committed)
  index.json                              # BM25 index used at runtime
```

## Architecture notes

**Retrieval.** ~3.6k chunks at ~120 tokens each. Title/author/topic overlap gets a small bonus, reference-list chunks get a 0.4× penalty so bibliography entries don't crowd out prose, people pages get a 1.7× boost when the query mentions "who"/"researcher"/"team". Hard cap of two chunks per article keeps the top-K diverse.

**Prompting.** The system prompt is two text blocks. The first holds the persona and the full catalog (titles, authors, dates, slugs of all 97 sources) and is marked `cache_control: ephemeral`. That preamble runs ~6–8K tokens, well over Sonnet 4.6's 2048-token cache minimum, so subsequent requests pay ~10% on those tokens instead of the full price. The second block holds the per-request retrieved excerpts and is uncached.

**Streaming.** `client.messages.stream` with `.finalMessage()`. The chat API emits SSE events: a single `sources` event up front (so the UI renders source cards while the model warms up), then `text` deltas, then `done` (with usage including `cacheReadTokens`).

**Citations.** Excerpts are numbered `[1]…[N]` in the prompt. The UI converts inline `[n]` markers in the assistant's prose into coral chips, and a "Sources" grid below each turn collapses chunks back into one card per article.

## Refreshing the corpus

```bash
pnpm scrape -- --refresh   # re-fetch every page
pnpm index                 # rebuild data/index.json
```

The scraper reads `__NEXT_DATA__` from each page (Forethought publishes via Next.js + Contentful) and lifts the structured article body out — so footnote markers, author lists, topic tags, and ISO dates are preserved verbatim.

## Configuration

`.env.local` knobs:

- `ANTHROPIC_API_KEY` — required.
- `NEXT_PUBLIC_SUPABASE_URL` / `…_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — optional. The default build does not use them; they are placeholders for swapping the local BM25 layer for a pgvector/Supabase-backed index.

## Deploy to Vercel

```bash
pnpm build
# Vercel auto-detects Next.js. Set ANTHROPIC_API_KEY in the project's
# Environment Variables. data/index.json is committed, so no separate
# ingest step on deploy.
```

The chat route uses `runtime: 'nodejs'` (the file-backed BM25 index isn't compatible with the edge runtime).

## Disclaimer

Forethought.chat is unofficial and not affiliated with Forethought. The model is grounded in Forethought's public writing but may still misattribute, oversimplify, or hallucinate — verify load-bearing claims against the linked sources.
