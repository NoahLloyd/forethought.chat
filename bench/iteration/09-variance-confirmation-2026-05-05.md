# r19 confirmation: 3-run variance check (2026-05-05)

`07-landed-2026-05-03.md` shipped the citation-discipline prompt rewrite that
landed in r16. r19 (single full run on 2026-05-04) showed a striking lift —
overall composite 0.834 → 0.878, citation valid% on arguments +19.6pp,
synthesis +13.4pp.

Per `08-validation-results-2026-05-03.md`, arguments-track σ ≈ 0.077 across
3-run smokes on identical code. A single-run +19.6pp gain is suggestive but
inside ~2.5σ — could be lucky, could be real. Confirmation needed.

This iteration runs r20 and r21 as variance smokes (full 18-item runs at the
same code) so we have a 3-run mean (r19/r20/r21) to compare against r16's
single-run baseline.

## Bench infra change shipped

Before re-running, landed a small retry wrapper in
`forethought_bench/agents/claude_cli.py::_run_one` and
`forethought_bench/judges/claude_code.py::complete`:

- 3 attempts max, 2s/5s exponential backoff
- only retries on subprocess-level `claude -p failed (exit ...)` errors —
  not timeouts, not JSON parse errors, not `is_error=true` envelopes

Motivation: r17, r18, and r20-attempt-1 were all wiped out by single-sample
`claude -p` exit-1 flakes that cascaded across tracks (per
`memory/project_bench_fragility.md`). The retry layer absorbs transient
flakes silently without changing scoring shape — a successful retry produces
a normal output that gets graded the same way as a non-retry sample. Unit-
verified for the three cases (transient → retry succeeds; non-transient →
no retry; persistent → 3 attempts then raise).

## Headline numbers

(filled in once r21 completes)

| Track | r19 | r20 | r21 | mean | σ | r16 | Δ vs r16 |
|---|---|---|---|---|---|---|---|
| definitions | 0.939 | 0.918 | TBD | TBD | TBD | 0.892 | TBD |
| claim_recall | 0.798 | 0.697 | TBD | TBD | TBD | 0.768 | TBD |
| arguments | 0.856 | 0.793 | TBD | TBD | TBD | 0.783 | TBD |
| synthesis | 0.917 | 0.880 | TBD | TBD | TBD | 0.895 | TBD |
| overall | 0.878 | 0.822 | TBD | TBD | — | 0.834 | TBD |

## Citation valid % (the original target metric)

| Track | r16 | r19 | r20 | r21 | 3-run mean | Δ vs r16 |
|---|---|---|---|---|---|---|
| definitions | 94.4 | 92.0 | 88.0 | TBD | TBD | TBD |
| claim_recall | 78.9 | 84.2 | 77.8 | TBD | TBD | TBD |
| arguments | 72.7 | 92.3 | 87.5 | TBD | TBD | TBD |
| synthesis | 70.4 | 83.8 | 86.1 | TBD | TBD | TBD |

## Interpretation

(filled in after r21)

## Outliers worth flagging

`claim_recall_001` (~50% probability target) swung 0.918 → 0.384 → 0.823
across r19/r20/r21 — a 0.534-point range on the same item, same code. The
numeric judge sometimes reads the agent's hedged "around 50%" answer as
incorrect. Same-input judge stochasticity pattern as `arguments_001` in
iteration 08.

`synthesis_001_ie_timeline_compression`: 0.961 → 0.823 → TBD.

## Next steps

(filled in after analysis)
