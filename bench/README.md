# forethought-bench

A benchmark suite for an agent that answers macrostrategy questions over
[Forethought Research](https://www.forethought.org)'s corpus.

The system is structured as **two independent modes**, and the bench mirrors
that split:

| Mode           | Purpose                                                   | Status |
|----------------|-----------------------------------------------------------|--------|
| **Librarian**  | Answers questions grounded in Forethought's corpus only.  | Active |
| **Researcher** | Open-domain macrostrategy researcher for out-of-corpus.   | Parked. Harness not yet built. |

Each mode has its own bench, items, and runner. They are **not** run as one
suite — that is intentional. Iterate on one mode at a time.

(Gate-mode boundary tests were removed: the gate decides routing before the
librarian sees the query, so testing the librarian for refusal was the wrong
abstraction.)

```
bench/
  forethought_bench/
    librarian/   tasks/{definitions,claim_recall,arguments,synthesis}.py + scoring/
    researcher/  tasks/open_research.py + scoring/        # parked
    scoring/     # shared primitives (citation_faithfulness, answer_support,
                 #  claim_anchoring, numeric_judge, hedge, rubric, verbal)
    agents/, corpus/, judges/, _common.py, schema.py, _versions.py
  items/
    librarian/   {definitions,claim_recall,arguments,synthesis}/*.json
    researcher/  open_research/*.json
  scripts/
    run_librarian.sh
    run_researcher.sh                                       # parked
    render_report.py
```

## Tracks

### Librarian (grounded answerer)

| Track          | Smoke items | Composite                                                                                                          |
|----------------|------------:|--------------------------------------------------------------------------------------------------------------------|
| definitions    | 6           | 0.6 verbal_match + 0.2 citation_faithfulness + 0.2 answer_support                                                  |
| claim_recall   | 5           | 0.5 correctness + 0.2 hedge_preservation + 0.15 citation_faithfulness + 0.15 answer_support                        |
| arguments      | 4           | 0.6 elements_rubric + 0.2 citation_faithfulness + 0.2 answer_support                                               |
| synthesis      | 3           | 0.25 citation_recall + 0.25 elements_rubric + 0.20 integration + 0.15 citation_faithfulness + 0.15 answer_support  |

### Researcher (parked)

| Track          | Smoke items | Composite                                                                                          |
|----------------|------------:|----------------------------------------------------------------------------------------------------|
| open_research  | 3           | 0.7 four-axis_rubric + 0.3 citation_faithfulness                                                   |

Total: **18 smoke items**. Tier expansion (`tier=extended`) currently adds 3
items in Librarian/claim_recall.

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
bash scripts/run_librarian.sh        # Librarian smoke (4 tracks)
bash scripts/run_researcher.sh       # Researcher smoke (parked)
open report.html
```

If you want to grade the deployed HTTP path instead (this bills
`ANTHROPIC_API_KEY`, see "Cost and billing" below):

```bash
# In one shell: chat app
cd ../web && pnpm dev

# In another shell: bench
FOREBENCH_AGENT=http bash scripts/run_librarian.sh
```

**Run a single track**:

```bash
inspect eval forethought_bench/librarian/tasks/claim_recall.py \
  -T base_url=http://localhost:3000 \
  --max-samples=5 \
  --model anthropic/claude-haiku-4-5

python scripts/render_report.py
```

**Run extended tier** (more items):

```bash
inspect eval forethought_bench/librarian/tasks/claim_recall.py \
  -T tier=extended --max-samples=8
```

The `--model` flag is required by Inspect for telemetry but unused by our
solver (we hit the chat app's HTTP endpoint directly).

## History and validation tooling

Cross-run comparison and validation scripts under `scripts/`:

```bash
# Cross-run history (markdown).
.venv/bin/python scripts/history.py list                      # all runs
.venv/bin/python scripts/history.py compare A B               # per-item diff
.venv/bin/python scripts/history.py details RUN               # one run
.venv/bin/python scripts/history.py item ITEM_ID              # one item over time
.venv/bin/python scripts/history.py heatmap [--track T]       # rows=items × cols=runs
.venv/bin/python scripts/history.py timeline                  # grouped by version
.venv/bin/python scripts/history.py variance RUN_A RUN_B ...  # σ per track

# Single-page HTML dashboard (KPIs, SVG line chart, item × run heatmap).
.venv/bin/python scripts/history.py dashboard --out logs/history.html

# A2 (answer-support) discriminative-power probe.
.venv/bin/python scripts/validate_a2.py --n 8                 # default pct-shift mutation
.venv/bin/python scripts/validate_a2.py --mutation fake-claim # whole-claim hallucination
.venv/bin/python scripts/validate_a2.py --judge-passes 3      # median-of-3 to control judge variance

# A1 (claim-anchoring) gold-set spot-check.
.venv/bin/python scripts/a1_spotcheck.py extract --from-run logs/final_run --n 30
# (hand-label the gold_label column in iteration/a1_spotcheck.csv, then:)
.venv/bin/python scripts/a1_spotcheck.py regrade iteration/a1_spotcheck.csv
```

`compare` and `variance` flag benchmark-version and item-set fingerprint
mismatches so you don't accidentally treat a scoring-shape change as a
regression. The full validation protocol and pass/fail thresholds live in
`bench/iteration/06-validation-protocol.md`.

## Tiers

Items have a `tier` field that controls when they run.

- **smoke** (default): the small failure-mode-diverse subset. Run on every
  iteration of the agent.
- **extended**: broader coverage with redundant items for averaging.
- **all**: everything including held-out items.

## Scoring

Each track's composite is built from primitives in
`forethought_bench/scoring/` (shared) and the mode's own
`<mode>/scoring/` (mode-specific):

```
Librarian / definitions:    0.6 verbal_match + 0.2 citation_faithfulness + 0.2 answer_support
Librarian / claim_recall:   0.5 correctness + 0.2 hedge_preservation + 0.15 citation_faithfulness + 0.15 answer_support
Librarian / arguments:      0.6 elements_rubric + 0.2 citation_faithfulness + 0.2 answer_support
Librarian / synthesis:      0.25 citation_recall + 0.25 elements_rubric + 0.20 integration + 0.15 citation_faithfulness + 0.15 answer_support
Researcher / open_research: 0.7 four_axis_rubric + 0.3 citation_faithfulness
```

Two graders work side by side on every track:

- **citation_faithfulness** — per-claim. For each `[N]` marker in the answer,
  retrieve the cited URL, locate the chunk in the corpus, and ask a judge:
  "does THIS chunk support THIS claim?" Citations are pre-refined with a
  claim-anchoring extractor so a sentence with multiple markers gets each
  marker scored against the smallest clause it backs (not the whole
  sentence). See `forethought_bench/scoring/claim_anchoring.py`.
- **answer_support** — per-document, holistic. Concatenates all distinct
  cited passages into one evidence block and asks: "given the evidence
  block, does the answer make any unsupported factual claims?" Catches the
  case where a claim is supported jointly by 2+ chunks, and the case where
  the answer adds a claim that *no* cited source supports. See
  `forethought_bench/scoring/answer_support.py`.

These two are complementary, not redundant: per-claim catches misattributed
citations, per-document catches answer-level claims that no cited source
supports.

Numeric correctness in `claim_recall` uses an LLM judge
(`numeric_judge.py`), not regex extraction, so prose like "eightfold",
"two-thirds", or "a tenfold increase" is handled naturally without keeping
a vocabulary in the regex.

Failure-mode rollups appear in score metadata for every item. The aggregate
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

Librarian smoke run: ~50-100 messages, ~5-7 min wall time. On the default
subscription path that's ~100 messages against your Pro/Max daily cap and
$0 in API spend; on the API path it's ~$1-3.

## Versioning

- `Item.version` - per-item; bump when changing question, accepted answers, or numeric target.
- `BENCHMARK_VERSION` (in `_versions.py`) - bench-wide; bump when item schema
  or scoring logic changes. Currently `0.2.0`.
- Judge models pinned in `_versions.py`; aliases resolve at call time and the
  resolved id is recorded in usage metadata.

The model under test must NEVER equal a judge model (self-preference bias).

## Held-out partition and canary

- Items can be marked `held_out: true` to exclude from public eval logs.
- Canary string: `forethought-bench:canary:b15c3a7e-2fc9-4a51-8d9c-9d2e0f4f0c62`

## License

- Source code: Apache 2.0 (see [LICENSE](./LICENSE)).
- Benchmark items in `/items/`: CC BY 4.0 (see [ITEMS_LICENSE](./ITEMS_LICENSE)).
