# forethoughtchat

Monorepo for [forethought.chat](https://forethought.chat) - an unofficial
chat companion for [Forethought Research](https://www.forethought.org)'s
public writing - and the eval suite that grades it.

```
.
├── web/        # Next.js 16 app deployed at forethought.chat
│                 (chat agent, in-app reader, browse, OG images)
└── bench/      # Python eval suite (Inspect AI) that grades the agent
                  across 6 tracks - ~6-9 min full smoke run
```

## Two parts

- **`web/`**: the deployed product. Contains the chat agent's prompt
  (`lib/prompt.ts`), iteration loop (`app/api/chat/route.ts`), search tool
  (`lib/search.ts`), and the corpus loader. The agent is intentionally not
  separated from the website - they share data, types, and retrieval.
- **`bench/`**: the eval harness. Tests the agent over HTTP via the
  `/api/chat` endpoint, scores 6 tracks (definitions, claim recall,
  arguments, synthesis, boundary, open research), produces aggregate reports.
  Subscription-billed via the `claude` CLI, so iteration is essentially free.

The iteration cycle: edit `web/lib/prompt.ts` -> `cd web && pnpm dev` ->
`cd bench && bash scripts/run_all_tracks.sh` -> read `bench/report.html` ->
repeat.

## Quickstart (web)

```bash
cd web
pnpm install
pnpm ingest          # scrape forethought.org and build the BM25 index
pnpm dev             # localhost:3000
```

See [web/README.md](./web/README.md) for the full chat-app docs.

## Quickstart (bench)

```bash
cd bench
uv venv && uv pip install -e ".[dev]"
# ensure web is running at localhost:3000
bash scripts/run_all_tracks.sh
open report.html
```

See [bench/README.md](./bench/README.md) for the eval-suite docs.

## Deployment

The Vercel project's **Root Directory** is set to `web`. The install command
in `web/vercel.json` runs `pnpm install` at the monorepo root so the
`@forethought/agent: workspace:*` dependency resolves; the build then runs
inside `web/` as Next.js. The bench is not built or deployed.
