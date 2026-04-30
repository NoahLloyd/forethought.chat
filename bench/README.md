# forethought-bench

A benchmark for agents that answer macrostrategy questions grounded in
[Forethought Research](https://www.forethought.org)'s corpus, falling back to
open research when the corpus runs out.

Designed for **fast iteration**: the full smoke benchmark (29 items across 6
tracks) runs in ~6-9 minutes. The default agent under test (`ClaudeCliAgent`)
spawns `claude -p` per item, billing against your Claude Pro/Max
subscription. Judges go through the same `claude -p` path. End-to-end the
benchmark uses **zero Anthropic API credit** in the default config.

## Tracks

All six tracks from the design doc are wired with V1 smoke items:

| # | Track                            | Smoke items | Scoring                                                                                               |
|---|----------------------------------|------------:|-------------------------------------------------------------------------------------------------------|
| 1 | Definition & Framework Recall    |           6 | verbal match (LLM judge against accepted phrasings) + citation faithfulness                            |
| 2 | Specific Claim Recall            |           5 | numeric tolerance + hedge preservation + citation faithfulness                                         |
| 3 | Argument Reconstruction          |           4 | required-elements rubric + citation faithfulness                                                       |
| 4 | Cross-Corpus Synthesis           |           3 | citation recall (>=2 URLs) + integration quality + required-elements + citation faithfulness          |
| 5 | Boundary Detection & Adversarial |           8 | behavioral classifier (ground/refuse/split/caveat) across 4 subtypes + citation faithfulness as side metric |
| 6 | Open-Domain Research             |           3 | 4-axis rubric (comprehensiveness/depth/instruction-following/readability) + citation faithfulness     |

Total: **29 smoke items**, expandable via `tier="extended"` (Track 2 already has 3 extended items).

## Setup

```bash
# Python deps
uv venv
uv pip install -e ".[dev]"

# Auth: claude CLI signed in to a Pro/Max account
which claude
claude  # one-shot interactive run to authenticate, then quit

# Node deps for the search wrapper (search.ts uses @forethought/agent)
cd .. && pnpm install
```

Corpus location:

```bash
export FORETHOUGHT_CONTENT_DIR=../web/data/content
```

## Running

The default agent (`ClaudeCliAgent`) talks to the corpus directly through
a Node-side search wrapper, so you do NOT need to start `pnpm dev`.

```bash
bash scripts/run_all_tracks.sh
open report.html
```

If you want to grade the deployed HTTP path instead (this bills
`ANTHROPIC_API_KEY`, see "Cost and billing" below):

```bash
# In one shell: chat app
cd ../web && pnpm dev

# In another shell: bench
FOREBENCH_AGENT=http bash scripts/run_all_tracks.sh
```

**Run a single track**:

```bash
inspect eval forethought_bench/tasks/claim_recall.py \
  -T base_url=http://localhost:3000 \
  --max-samples=5 \
  --model anthropic/claude-haiku-4-5

python scripts/render_report.py
```

**Run extended tier** (more items):

```bash
inspect eval forethought_bench/tasks/claim_recall.py -T tier=extended --max-samples=8
```

The `--model` flag is required by Inspect for telemetry but unused by our
solver (we hit the chat app's HTTP endpoint directly).

## Tiers

Items have a `tier` field that controls when they run.

- **smoke** (default): the small failure-mode-diverse subset. Run on every
  iteration of the agent.
- **extended**: broader coverage with redundant items for averaging.
- **all**: everything including held-out items.

## Scoring composites (V2 of the bench, version 0.2.0)

Each track's scorer composes primitives:

```
Track 1 (definitions):       0.6 verbal_match + 0.4 citation_faithfulness
Track 2 (claim_recall):      0.5 correctness + 0.2 hedge_preservation + 0.3 citation_faithfulness
Track 3 (arguments):         0.7 elements_rubric + 0.3 citation_faithfulness
Track 4 (synthesis):         0.3 citation_recall + 0.3 elements_rubric + 0.2 integration_quality + 0.2 citation_faithfulness
Track 5 (boundary):          1.0 behavioral_match (binary)
Track 6 (open_research):     0.7 four_axis_rubric + 0.3 citation_faithfulness
```

Failure-mode rollups in score metadata for every item. The aggregate
report shows per-track composite + per-item drill-down.

## Citation faithfulness pipeline

End-to-end LLM judging is intentionally **not** used for citations. Four stages:

1. Extract `(claim, citation)` pairs from agent output. For chat-app-shaped
   agents this is deterministic (parse `[N]` markers + use sources event).
2. Look up cited URL in the local corpus.
3. Fuzzy-match the quoted passage (the actual chunk the agent saw, threaded
   from the chat app's `sources` event) inside the document at that URL.
4. LLM judge: does the located passage support the claim?

Per-citation verdict: `valid` / `fabricated` / `real_but_unsupportive` / `partial`.

## Cost and billing

There are two sources of model spend in a bench run: **judge calls** and the
**agent under test**. Both are subscription-billed in the default config.

| Component        | Default (subscription)         | Override → API spend                              |
|------------------|--------------------------------|---------------------------------------------------|
| Judge            | `claude -p` (Pro/Max OAuth)    | `FOREBENCH_USE_API=1` → bills `ANTHROPIC_API_KEY` |
| Agent under test | `claude -p` (Pro/Max OAuth)    | `FOREBENCH_AGENT=http` → bills `ANTHROPIC_API_KEY` via `/api/chat` |

The default `FOREBENCH_AGENT=cli` keeps the agent on the subscription path
by spawning `claude -p` with a Bash tool that calls
`scripts/forethought-search.sh` (a wrapper around the same
`@forethought/agent` retrieval the production app uses). Citations and
markers behave identically to the deployed chat agent.

Per-call cost (notional, what API would charge if you used the API path):

| Judge model | Cold cache | Warm cache |
|---|---|---|
| `opus` (default) | ~$0.10 | ~$0.025 |
| `haiku` | ~$0.04 | ~$0.012 |

Full smoke benchmark: ~80-150 messages, ~6-9 min wall time. On the default
subscription path that's ~150 messages against your Pro/Max daily cap and
$0 in API spend; on the API path it's ~$2-4 (judges) plus a comparable
amount for the agent's tool-loop iterations.

## Versioning

- `Item.version` - per-item; bump when changing question, accepted answers, or numeric target.
- `BENCHMARK_VERSION` (in `_versions.py`) - bench-wide; bump when item schema
  or scoring logic changes. Currently `0.2.0` (after tier system + all 6 tracks wired).
- Judge models pinned in `_versions.py`; aliases resolve at call time and the
  resolved id is recorded in usage metadata.

The model under test must NEVER equal a judge model (self-preference bias).

## Held-out partition and canary

- Items can be marked `held_out: true` to exclude from public eval logs.
- Canary string: `forethought-bench:canary:b15c3a7e-2fc9-4a51-8d9c-9d2e0f4f0c62`

## License

- Source code: Apache 2.0 (see [LICENSE](./LICENSE)).
- Benchmark items in `/items/`: CC BY 4.0 (see [ITEMS_LICENSE](./ITEMS_LICENSE)).
