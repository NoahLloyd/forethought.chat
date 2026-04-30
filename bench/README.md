# forethought-bench

A benchmark for agents that answer macrostrategy questions grounded in
[Forethought Research](https://www.forethought.org)'s corpus, falling back to
open research when the corpus runs out.

Designed for **fast iteration**: the full smoke benchmark (29 items across 6
tracks) runs in ~6-9 minutes against a live chat agent, billed against a
Claude Pro/Max subscription via the `claude` CLI rather than API costs.

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

# Subscription billing path (default): claude CLI authenticated via `claude` once
which claude

# API fallback (set FOREBENCH_USE_API=1 at run time)
export ANTHROPIC_API_KEY=sk-...
```

Corpus location:

```bash
export FORETHOUGHT_CONTENT_DIR=../web/data/content
```

## Running

**Run the full smoke benchmark** (one shell):

```bash
# In one shell: chat app
cd /path/to/forethoughtchat && pnpm dev

# In another shell: bench
bash scripts/run_all_tracks.sh
open report.html
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

- **Default**: judge calls go through `claude -p` subprocess, billed against
  your Claude Pro/Max subscription. Each call counts as ~1 message in your
  rate limit.
- **API fallback**: `FOREBENCH_USE_API=1` to bill `ANTHROPIC_API_KEY`.

Per-call cost (notional, what API would charge):

| Judge model | Cold cache | Warm cache |
|---|---|---|
| `opus` (default) | ~$0.10 | ~$0.025 |
| `haiku` | ~$0.04 | ~$0.012 |

Full smoke benchmark: ~80-150 messages, ~$2-4 notional, ~6-9 min wall time.

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
