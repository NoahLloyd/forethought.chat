# Forethought.chat

An unofficial chat companion for the public writing of [Forethought](https://www.forethought.org), the Oxford research nonprofit studying the transition to advanced AI.

Built with Next.js 15, Tailwind 4, TypeScript, and the Anthropic SDK. Retrieval is BM25 over a prebuilt chunk index; the system prompt embeds the catalog and uses Anthropic's prompt cache so multi-turn sessions stay cheap.

## Quick start

```bash
pnpm install
pnpm ingest          # scrape forethought.org and build the BM25 index
pnpm dev             # http://localhost:3000
```

The chat route runs through the local `claude` CLI by default — if it's on `PATH` and you've signed in once, every turn spawns `claude -p` and bills your Pro/Max subscription. To set this up: install [Claude Code](https://docs.claude.com/en/agent-sdk/quickstart), run `claude` interactively once to authenticate, then quit.

When the CLI isn't on `PATH` (a deployed Vercel host, a fresh laptop), the route falls through to the Anthropic API SDK and uses `ANTHROPIC_API_KEY`. That's how the deployed site at forethought.chat works without anyone needing to install Claude Code. If neither path is available the chat route returns a 400.

To force one path regardless of detection set `LIBRARIAN_TRANSPORT=cli` or `LIBRARIAN_TRANSPORT=api`.

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

**Streaming.** SSE-shaped events: `tool_call` per search invocation, `sources` (cumulative) when new chunks land in the registry, `text` deltas as the model writes prose, then `done` with usage and cache reads. The CLI transport spawns `claude -p --output-format stream-json --include-partial-messages` and translates that stream into the same shape; the API transport uses `client.messages.stream` + `.finalMessage()`.

**Citations.** Excerpts are numbered `[1]…[N]` in the prompt. The UI converts inline `[n]` markers in the assistant's prose into coral chips, and a "Sources" grid below each turn collapses chunks back into one card per article.

## Refreshing the corpus

```bash
pnpm scrape -- --refresh   # re-fetch every page
pnpm index                 # rebuild data/index.json
```

The scraper reads `__NEXT_DATA__` from each page (Forethought publishes via Next.js + Contentful) and lifts the structured article body out, so footnote markers, author lists, topic tags, and ISO dates are preserved verbatim.

## Configuration

`.env.local` knobs:

- `ANTHROPIC_API_KEY`: read by `/api/chat` only when the local `claude` CLI isn't on `PATH` and no BYOK key is supplied. Required on a deployed host without the CLI; optional locally if you've signed in to `claude` once.
- `LIBRARIAN_TRANSPORT`: `cli` or `api`. Forces a specific Anthropic transport regardless of detection. Leave unset to auto-pick.
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY`: optional. When set, chat history persists to Supabase Postgres and the left sidebar shows past conversations. When unset, chats live in `localStorage`.

## Bring-your-own-key (BYOK)

The **Settings** drawer at the bottom of the sidebar lets users plug in their own API key for any of the supported providers:

| Provider  | SDK              | Models surfaced in the picker                                  |
| --------- | ---------------- | -------------------------------------------------------------- |
| Anthropic | `@anthropic-ai/sdk` | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5                       |
| OpenAI    | `openai`         | GPT-4.1, GPT-4o, GPT-4o mini                                   |
| Google    | `@google/genai`  | Gemini 2.5 Pro, Gemini 2.5 Flash                               |

A BYOK Anthropic key always takes the API path (overriding the CLI), since the user has explicitly opted into paying for it. Keys are stored only in the user's browser (`localStorage`) and sent server-side with each chat request, where they're used once and discarded; never logged or persisted.

The agent loop (a single `search` tool over the BM25 corpus) is implemented per-provider in `lib/providers/{anthropic,anthropic-cli,openai,google}.ts`. Anthropic has two transports: `anthropic-cli.ts` spawns `claude -p` for subscription-billed runs, `anthropic.ts` uses the SDK with an API key. The route in `app/api/chat/route.ts` dispatches based on detection + BYOK config and shares a single citation-marker registry so `[1]…[N]` markers are stable regardless of which model produced the answer.

## Chat history (optional Supabase setup)

Chat history is stored in Postgres so users can come back to previous conversations across devices/sessions. The wiring is opt-in: leave the env vars unset and the app works as a single-session chat backed by `localStorage`.

> **Note on key formats.** Supabase rolled out new API keys in mid-2025: `sb_publishable_…` (replaces `anon`) and `sb_secret_…` (replaces `service_role`). Projects created after **November 1, 2025** only ship with the new format; the legacy keys will be deleted entirely in late 2026. Our server wrapper accepts either format; just set `SUPABASE_SECRET_KEY` for new projects, or `SUPABASE_SERVICE_ROLE_KEY` if you have an older project that still uses the JWT keys.

To enable:

1. Create a Supabase project at <https://supabase.com>.
2. Run the migration in `supabase/migrations/0001_chats.sql`: paste it into the SQL editor (Database → SQL Editor) or use `supabase db push` if you have the CLI.
3. In the dashboard go to **Project Settings → API Keys**. Copy the project URL and a secret key into `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxx
   ```

   Use the **Secret keys** section, not the Publishable key. The secret key is server-only and is what bypasses RLS. (`sb_secret_…` is rejected by the supabase-js client if you accidentally try to use it in a browser, so it's safe-by-default.) All reads/writes go through `app/api/chats/...`, which scopes rows to a cookie-based anonymous user id (`ftc_uid`). RLS on `chats` is enabled with a deny-all policy so even a leaked publishable/anon key cannot reach the table.

4. Redeploy with the same env vars. The sidebar will switch from "Past chats will appear here once Supabase is configured" to a live history list as soon as `/api/chats` reports `enabled: true`.

### Schema

`chats` is the only table:

| column      | type        | notes                                          |
| ----------- | ----------- | ---------------------------------------------- |
| id          | uuid        | primary key, generated server-side             |
| user_id     | text        | cookie-derived anonymous identity              |
| title       | text        | derived from the first user turn (≤ 80 chars)  |
| transcript  | jsonb       | full `ChatTurn[]` from the client              |
| mentions    | jsonb       | `ArticleMention[]` carried over for replay     |
| created_at  | timestamptz |                                                |
| updated_at  | timestamptz | trigger keeps it current on update             |

### Other things that benefit from being online

Once Supabase is plumbed, natural follow-ons (not yet built):

- **Per-query analytics**: a small `events` table that logs anonymous query/response timings and which sources got cited. Useful for tuning the BM25 ranker and spotting questions the corpus doesn't answer well.
- **Response feedback**: thumbs-up/down per assistant turn, scoped to the same anonymous id. Drops directly into the same RLS-deny posture.
- **Shared chats**: a public-read flag on `chats` plus a slug column lets users share a transcript via URL.

## Deploy

```bash
pnpm build
# Vercel auto-detects Next.js. Set ANTHROPIC_API_KEY in the project's
# Environment Variables — the CLI isn't available on serverless hosts,
# so the chat route falls through to the API. data/index.json is
# committed so there's no separate ingest step.
```

The chat route uses `runtime: 'nodejs'` (the file-backed BM25 index isn't compatible with edge).

### Running locally on another machine

To get the cheaper subscription path on your own laptop:

1. Clone the repo and `pnpm install` at the monorepo root.
2. Install [Claude Code](https://docs.claude.com/en/agent-sdk/quickstart) and run `claude` once interactively to authenticate against your Pro/Max account.
3. `pnpm dev` — the chat route detects `claude` on `PATH` and spawns it per turn, billing the subscription. You don't need to set `ANTHROPIC_API_KEY` for this path.

## Disclaimer

Forethought.chat is unofficial and not affiliated with Forethought. The model is grounded in Forethought's public writing but may still misattribute, oversimplify, or hallucinate; verify load-bearing claims against the linked sources.
