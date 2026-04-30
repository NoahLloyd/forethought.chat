# forethought-bench

A benchmark for agents that answer macrostrategy questions grounded in
[Forethought Research](https://www.forethought.org)'s corpus, falling back to
open research when the corpus runs out.

Designed for **fast iteration**: the default `smoke` tier runs the whole of
Track 2 in ~25 seconds, billed against a Claude subscription via the
`claude` CLI rather than API costs.

## Status

| Track | Name                            | V1 status |
| ----- | ------------------------------- | --------- |
|   1   | Definition & Framework Recall   | stub      |
|   2   | Specific Claim Recall           | **wired** (5 smoke + 3 extended) |
|   3   | Argument Reconstruction         | stub      |
|   4   | Cross-Corpus Synthesis          | stub      |
|   5   | Boundary Detection & Adversarial| stub      |
|   6   | Open-Domain Research            | stub      |

Cross-cutting:
- **Citation faithfulness** (4-stage pipeline) - implemented and used by Track 2.
- Atomic fact verification, calibration / Brier, trace quality - V2.

## Setup

Python 3.11+, Claude Code CLI installed and authenticated (for subscription
billing). Anthropic API key only needed if you opt out of subscription mode.

```bash
uv venv                  # or python -m venv .venv
uv pip install -e ".[dev]"

# subscription path (default): claude CLI authenticated via `claude` once
which claude

# api fallback path:
export ANTHROPIC_API_KEY=sk-...
```

## Corpus

forethought-bench does **not** rehost the Forethought corpus. Each item names
the URL of the source it grounds; the citation faithfulness pipeline verifies
agent citations against a local index of those sources.

For V1 the loader consumes [forethoughtchat](https://forethought.chat)'s
extracted content (one JSON record per page, produced by `pnpm scrape`):

```bash
export FORETHOUGHT_CONTENT_DIR=/path/to/forethoughtchat/data/content
```

## Tiers and the iteration loop

Items have a `tier` field that controls when they run.

- **smoke** (default): the small failure-mode-diverse subset. Run on every
  iteration of the agent. ~5 items per track, ~25-60s wall time.
- **extended**: broader coverage with redundant items for averaging. Run
  before merging meaningful changes. ~8-15 items per track.
- **all**: everything in items/, including held-out items. Don't run this
  in normal flow; it's the public + private set together.

You won't usually want a "comprehensive 200-item" run - the failure modes
this benchmark catches are mode-diverse, not item-count-driven. If you ever
need to publish, grow each track to ~50 items at that point.

## Running Track 2

In one shell, run the chat app:

```bash
cd /path/to/forethoughtchat && pnpm dev
```

In another shell, run the smoke benchmark:

```bash
inspect eval forethought_bench/tasks/claim_recall.py \
  -T base_url=http://localhost:3000 \
  -T content_dir=$FORETHOUGHT_CONTENT_DIR \
  --max-samples=5 \
  --model anthropic/claude-haiku-4-5
```

`--max-samples=5` runs all 5 smoke items in parallel (each item still
parallelizes its own citation checks via asyncio). Drop wall time from
~70s to ~25s.

The `--model` flag is required by Inspect for telemetry but isn't used by
our solver (we hit the chat app's HTTP endpoint directly).

Run extended tier (8 items, ~30s):

```bash
inspect eval forethought_bench/tasks/claim_recall.py \
  -T tier=extended --max-samples=8 ...
```

Render the report after a run:

```bash
python scripts/render_report.py
open report.html
```

## Cost and billing

- **Default**: judge calls go through `claude -p` subprocess, billed against
  your Claude Pro/Max subscription. Each call counts as ~1 message in your
  rate limit; a Track 2 smoke run is ~15 messages.
- **API fallback**: set `FOREBENCH_USE_API=1` to bill against
  `ANTHROPIC_API_KEY`. ~3-5x faster (no Claude Code subprocess overhead) but
  you pay per token.

Per-call cost (notional, what API would charge):

| Judge model | Cold cache | Warm cache | Use case |
|---|---|---|---|
| `opus` (default) | ~$0.10 | ~$0.025 | rigorous grading |
| `haiku` | ~$0.04 | ~$0.012 | cheap regressions |

## Composite score (Track 2)

```
score = 0.5 * correctness          (numeric within tolerance, or verbal MATCH)
      + 0.2 * hedge_preserved      (binary; vacuous when source had no hedges)
      + 0.3 * citation_faithfulness (fraction of citations with verdict VALID)
```

Failure-mode rollups in score metadata:
- `hedge.missing_hedges` - which source hedges the agent stripped
- `citation_faithfulness.{valid,fabricated,unsupportive,partial}` - per-verdict counts
- `citation_checks` - per-citation rationale for each verdict

### Citation faithfulness pipeline

End-to-end LLM judging is intentionally **not** used for citations. The
"real paper, but doesn't actually support the claim" failure is invisible to
end-to-end judging and the most damaging trust failure for a research-grounded
agent. Instead, four stages:

1. Extract `(claim, citation)` pairs from agent output. For chat-app-shaped
   agents this is deterministic (parse `[N]` markers + use sources event).
2. Look up cited URL in the local corpus.
3. Fuzzy-match the quoted passage inside the document at that URL.
4. LLM judge: does the located passage support the claim?

Per-citation verdict:
- **valid** - passage found AND supports claim
- **fabricated** - URL not in corpus, OR passage not in cited URL's doc
- **real_but_unsupportive** - passage found but doesn't support the claim
- **partial** - supports part of the claim or supports it weakly

## Versioning and reproducibility

The benchmark records its own version + the agent + judge models in every
eval log so you can tell whether a change in scores is real or just a bench
change.

- `Item.version` - per-item; bump when changing question, accepted answers,
  or numeric target.
- `BENCHMARK_VERSION` (in `_versions.py`) - bench-wide; bump when item schema
  or scoring logic changes.
- Judge models pinned in `_versions.py` for the API path; for Claude Code the
  alias resolves at call time and is recorded in usage metadata.

The model under test must NEVER equal a judge model (self-preference bias).
The chat app is `claude-sonnet-4-6`; Track 2 defaults the judge to
`claude-opus-4-7` (different family, more capable).

## Held-out partition and canary

- ~20% of items per track should be marked `held_out: true` and kept out of
  public eval logs. Run with `-T include_held_out=true` only for the private
  test set. (Track 2 has none yet.)
- forethought-bench's contamination-canary string:

  `forethought-bench:canary:b15c3a7e-2fc9-4a51-8d9c-9d2e0f4f0c62`

## License

- Source code: Apache 2.0 (see [LICENSE](./LICENSE)).
- Benchmark items in `/items/`: CC BY 4.0 (see [ITEMS_LICENSE](./ITEMS_LICENSE)).
- Source passages quoted in items remain the IP of their authors and
  Forethought Research.
