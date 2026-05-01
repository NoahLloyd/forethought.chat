# forethoughtchat

Monorepo for [forethought.chat](https://forethought.chat) — an unofficial
chat companion for [Forethought Research](https://www.forethought.org)'s
public writing — and the eval suite that grades it.

```
.
├── web/        # Next.js 16 app deployed at forethought.chat
│                 (chat agent, in-app reader, browse, OG images)
└── bench/      # Python eval suite (Inspect AI). Three independent benches,
                  one per mode (Librarian / Gate / Researcher).
```

## Three modes

The product is split into three modes that are iterated on independently:

| Mode           | Job                                                       | Status |
|----------------|-----------------------------------------------------------|--------|
| **Librarian**  | Answers questions grounded in Forethought's corpus only.  | Active. The current `/api/chat` is the Librarian. |
| **Gate**       | Routes: is this answerable from Forethought, or not?      | Bench exists; production routing not yet wired. |
| **Researcher** | Open-domain macrostrategy researcher for out-of-corpus.   | Parked. Harness not yet built. |

Each has its own bench (see `bench/README.md`). They are not run as one
suite — that is intentional.

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
# Pick a mode:
bash scripts/run_librarian.sh        # in-corpus answer quality (4 tracks)
bash scripts/run_gate.sh             # routing decision (boundary)
bash scripts/run_researcher.sh       # parked
open report.html
```

See [bench/README.md](./bench/README.md) for the eval-suite docs.

## Iteration cycle (Librarian)

Edit `web/lib/prompt.ts` → `cd web && pnpm dev` → `cd bench && bash
scripts/run_librarian.sh` → read `bench/report.html` → repeat.

## Deployment

The Vercel project's **Root Directory** is set to `web`. The install command
in `web/vercel.json` runs `pnpm install` at the monorepo root so the
`@forethought/agent: workspace:*` dependency resolves; the build then runs
inside `web/` as Next.js. The bench is not built or deployed.
