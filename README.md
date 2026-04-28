# forethought-bench

A benchmark for agents that answer macrostrategy questions grounded in
[Forethought Research](https://www.forethought.org)'s corpus, falling back to
open research when the corpus runs out.

Six tracks plus cross-cutting metrics; **Track 2 (Specific Claim Recall) is
fully wired in V1**, the other five tracks are stubbed with their grading
plan in code comments.

## Status

| Track | Name                            | V1 status |
| ----- | ------------------------------- | --------- |
|   1   | Definition & Framework Recall   | stub      |
|   2   | Specific Claim Recall           | **wired** |
|   3   | Argument Reconstruction         | stub      |
|   4   | Cross-Corpus Synthesis          | stub      |
|   5   | Boundary Detection & Adversarial| stub      |
|   6   | Open-Domain Research            | stub      |

Cross-cutting:
- **Citation faithfulness** (multi-stage pipeline) — implemented and used by
  Track 2.
- Atomic fact verification (FActScore-style) — V2.
- Calibration / Brier — V2 (only if agents emit probabilities).
- Trace quality — V2.

## Setup

Python 3.11+, [`uv`](https://github.com/astral-sh/uv) recommended.

```bash
uv venv
uv pip install -e ".[dev]"
```

Set credentials:

```bash
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

Each file in that directory matches the schema:

```json
{
  "url": "https://www.forethought.org/research/...",
  "category": "research",
  "slug": "three-types-of-intelligence-explosion",
  "title": "Three Types of Intelligence Explosion",
  "authors": ["Tom Davidson", "Rose Hadshar", "William MacAskill"],
  "topics": ["intelligence-explosion"],
  "publishedAt": "2025-...",
  "body": "<markdown>",
  "text": "<plain-text>"
}
```

Future: a pgvector + tsvector hybrid retrieval backend (per the design doc)
will drop in behind the same `Corpus` interface.

## Running Track 2

The agent under test must be reachable as an HTTP service. forethought-bench
ships an adapter for the forethoughtchat `/api/chat` SSE endpoint:

```bash
# In one shell, run the chat app at localhost:3000:
cd /path/to/forethoughtchat && pnpm dev

# In another shell:
inspect eval forethought_bench.tasks.claim_recall \
  -T base_url=http://localhost:3000 \
  -T content_dir=$FORETHOUGHT_CONTENT_DIR
```

Run with held-out items (the private partition - keep these off public logs):

```bash
inspect eval forethought_bench.tasks.claim_recall -T include_held_out=true
```

Inspect AI logs land under `./logs/`; view them with:

```bash
inspect view
```

## What Track 2 grades

For each item the scorer emits a composite in [0, 1]:

```
score = 0.5 * correctness
      + 0.2 * hedge_preserved
      + 0.3 * citation_faithfulness
```

- **correctness** — for `claim_type=numeric`, value within `rtol`/`atol` of
  `numeric_target`. For `verbal`, an LLM judge classifies the answer as
  MATCH / PARTIAL / MISS against the item's accepted phrasings.
- **hedge_preserved** — the agent did not strip source hedges (e.g.,
  preserved "we estimate ~50%" rather than "Forethought says 50%"). Vacuously
  satisfied when the source has no hedges.
- **citation_faithfulness** — fraction of agent citations with verdict VALID
  in the 4-stage pipeline. Per-citation breakdown
  (valid / fabricated / real-but-unsupportive / partial) is in the score's
  metadata.

### Citation faithfulness pipeline

End-to-end LLM judging is intentionally **not** used for citations. The
"real paper, but doesn't actually support the claim" failure is invisible to
end-to-end judging and the most damaging trust failure for a research-grounded
agent. Instead, four stages:

1. Extract `(claim, citation)` pairs from agent output.
2. Retrieve the cited document from the corpus by URL.
3. Locate the quoted passage in the document (fuzzy match).
4. LLM judge: does the located passage support the claim?

Verdicts:
- **VALID** — passage found AND supports claim.
- **FABRICATED** — URL not in corpus, OR passage not in cited URL's doc.
- **REAL_BUT_UNSUPPORTIVE** — passage found but doesn't support the claim.
- **PARTIAL** — supports part of the claim or supports it weakly.

## Agent contract

The agent under test must emit (or be wrapped to emit) this structured shape:

```json
{
  "final_answer": "string",
  "citations": [
    {
      "url": "string",
      "title": "string",
      "passage": "string|null",
      "supports": "string"
    }
  ],
  "confidence": "number 0..1 | null",
  "search_queries": ["string"],
  "retrieved_passages": [{"url": "...", "title": "...", "text": "..."}]
}
```

Without `Citation.supports`, citation faithfulness can only verify existence
(stages 2-3) and degrades to PARTIAL. Agents that emit prose with `[N]`
markers are post-hoc extracted into this shape by
`forethought_bench.agents.extractor` (an LLM call per item).

## Item curation

See [items/claim_recall/README.md](./items/claim_recall/README.md) for the
Track 2 item template and curation rules. Each track has its own README.

## Versioning

The benchmark's value is reproducibility; reproducibility lives or dies on
version tags. forethought-bench version-tags everything an eval depends on:

- **Item version** (`Item.version`): bump when you change an item's question,
  accepted answers, or numeric target.
- **Benchmark version** (`forethought_bench._versions.BENCHMARK_VERSION`):
  bump when item schema or scoring logic changes.
- **Judge models** (`JUDGE_CLAUDE`, `JUDGE_OPENAI`, `JUDGE_OPEN_WEIGHT` in
  `_versions.py`): pinned to exact build strings - never aliases. APIs shift
  silently behind aliases.
- **Extractor model** (`EXTRACTOR`): pinned likewise.
- **Corpus snapshot date**: comes from the source `publishedAt` and the
  scrape timestamp embedded in `data/index.json` of the corpus loader.

The model under test must NEVER equal a judge model (self-preference bias).

## Held-out partition and canary

- ~20% of items per track should be marked `held_out: true` and kept out of
  public eval logs and dashboards. Run with `-T include_held_out=true` only
  when running the private test set.
- forethought-bench's contamination-canary string is:

  `forethought-bench:canary:b15c3a7e-2fc9-4a51-8d9c-9d2e0f4f0c62`

  Embed it in any documentation or item file you want to detect in future
  training-data contamination. Items themselves do not currently embed
  per-item canaries; this is V1.5.

## License

- Source code: Apache 2.0 (see [LICENSE](./LICENSE)).
- Benchmark items in `/items/`: CC BY 4.0 (see [ITEMS_LICENSE](./ITEMS_LICENSE)).
- Source passages quoted in items remain the IP of their authors and
  Forethought Research; quotation for benchmarking is intended as fair use.
