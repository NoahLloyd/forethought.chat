# Validation results — 2026-05-03 (post-A1+A2+A3)

## Headline numbers

`final_run` (v0.2.0, baseline) → `iter_a1a2a3_v3` (v0.3.0):

| Track | Δ composite | Δ valid_cite | A2 ans_sup |
|---|---|---|---|
| definitions | +0.180 | +9.8pp | 0.742 |
| claim_recall | +0.128 | +8.4pp | 0.327 |
| arguments | +0.138 | +19.2pp | 0.875 |
| synthesis | +0.039 | +25.2pp | 0.700 |
| **overall (n-weighted)** | **+0.134** | — | — |

(Pre-iteration overall composite excludes boundary; post-iteration the
boundary track is removed entirely.)

`claim_recall_008` (Britain 8x GDP) — A3 target item: 0.20 → 0.715. The
numeric judge fires correctly but cite_faith and ans_sup drag the
composite below the 0.85 target.

Citation valid rate climbs from ~10% to ~24% on average — A1 working but
short of the 25–30% target on definitions/claim_recall.

## A2 discriminative-power validation: FAIL across three configurations

Three back-to-back runs of `scripts/validate_a2.py --n 8`:

| run | prompt | mutation | faithful | halluc. | gap | verdict |
|---|---|---|---|---|---|---|
| 1 | original | pct-shift +25 | 0.748 | 0.691 | +0.057 | ⚠ FAIL |
| 2 | tightened (per-number cross-check) | pct-shift +25 | 0.717 | 0.823 | -0.106 | ⚠ FAIL |
| 3 | tightened | append-fake-claim | 0.805 | 0.784 | +0.021 | ⚠ FAIL |

The tightened prompt was reverted after run 2 — it made the gap **worse**,
not better. The judge wasn't being too lenient; it was being too noisy.
In runs 2 and 3, ~half of the 8 pairs had hallucinated scoring HIGHER
than faithful. That is not a calibration problem — that is sampling
noise drowning the signal.

Hand-checked one item with two consecutive judge calls on the same input:
1.000 vs 0.733. The CLI judge has no temperature flag (`claude -p`
defaults to ~1.0 with no exposed seed control), so per-call verdicts
diverge.

### Diagnosis

A2's per-call signal-to-noise is too low to validate in 8-pair, single-
judge runs. The problem is not the prompt and not the mutation — it is
the variance of a stochastic judge applied to a single answer.

### Available levers

- **Multi-judge median (built, not yet run)**: `validate_a2.py
  --judge-passes 3` calls the judge 3× per AgentOutput and takes the
  median score, picking the unsupported_claims list closest to that
  median. Triples cost; should cut σ by ~√3.
- **Switch to API judge for A2**: ClaudeJudge supports `temperature=0`.
  Requires `ANTHROPIC_API_KEY`; modest spend per smoke. The deterministic
  outcome would be a much sharper test of the prompt itself.
- **Drop A2's composite weight to 0.05**: until A2 is stable, it is a
  noisy diagnostic rather than a scoring component. Reweight to keep
  the composite shape close to v0.2.0 (mostly verbal/elements +
  cite_faith) and surface ans_sup separately as a per-track "extra
  signal" line in the report.

## Variance probe: 3 runs of same code

Three smokes on identical code (`iter_a1a2a3_v3`, `_v3b`, `_v3c`):

| Track | mean | σ | range | σ≤0.025? |
|---|---|---|---|---|
| arguments | 0.714 | **0.077** | [0.667, 0.802] | ⚠ |
| claim_recall | 0.678 | 0.009 | [0.671, 0.688] | ✓ |
| definitions | 0.760 | 0.035 | [0.731, 0.799] | ⚠ |
| synthesis | 0.787 | 0.026 | [0.759, 0.809] | ⚠ (borderline) |

The arguments track is the noisiest. Drilling in: `arguments_001`
swung 0.90 → 0.735 → 0.77 across runs because A2 ans_sup oscillates
between 0.40-1.00 (12-0 unsupported claims) on the same answer, same
evidence — judge stochasticity. The CLI judge runs at default
temperature with no exposed seed control.

### What this means for the +0.134 v3 headline

The 3-run average is **0.732** (Δ +0.103 from baseline 0.629), not 0.763.
The v3 single-run number was a lucky high. Per-track:

| Track | Baseline | 3-run mean | Δ | σ | Significant? |
|---|---|---|---|---|---|
| definitions | 0.618 | 0.760 | +0.142 | 0.035 | ✓ (4σ) |
| claim_recall | 0.544 | 0.678 | +0.134 | 0.009 | ✓ (15σ) |
| arguments | 0.664 | 0.714 | +0.050 | 0.077 | ⚠ within noise |
| synthesis | 0.755 | 0.787 | +0.032 | 0.026 | ⚠ ~1σ |

**Definitions and claim_recall improvements are real.** Arguments and
synthesis lifts are within run-to-run noise on a 3-run estimate — could
be real but we can't prove it from this data.

## What this means for the +0.134 headline

Some unknown share is real (A1 lifts cite_faith VALID rate visibly per
track) and some share is recalibration (A2 went from constant 0.20 floor
to 0.32–0.88 range, structurally inflating composites). Until A2 passes
the discriminative-power test, treat the +0.134 as a mix of recalibration
and signal — not pure signal.

## Tooling shipped this iteration

- `scripts/history.py {list,compare,details,item,heatmap,timeline,variance,dashboard}`:
  cross-run comparison with benchmark-version + item-set fingerprint
  warnings; HTML dashboard with SVG line chart and item × run heatmap.
- `scripts/validate_a2.py`: synthetic hallucinated-variant probe with
  configurable mutation.
- `scripts/a1_spotcheck.py`: extract REAL_BUT_UNSUPPORTIVE citations to
  CSV for hand-labeling, then `regrade` re-runs A1 + grader against the
  labeled set.

## Next iteration

1. **Run multi-judge validate**: `validate_a2.py --judge-passes 3 --n 8
   --mutation pct-shift`. If gap ≥0.30 with median-of-3 but fails
   single-judge, the variance fix lands as a wrapper for production scoring.
2. **If multi-judge still fails**: switch A2 to ClaudeJudge (API,
   temperature=0). Set ANTHROPIC_API_KEY and re-test. The bench README
   should warn this is the only fully-deterministic A2 path.
3. **Composite reweight (BENCHMARK_VERSION 0.3.1) if A2 stays noisy**:
   drop ans_sup weight from 0.15-0.20 → 0.05; re-print as a "diagnostic
   line" in the report rather than a primary scorer.
4. **Hand-label `iteration/a1_spotcheck.csv`** (30 rows) and run
   `a1_spotcheck.py regrade` — the only validation that needs human
   ground truth.
5. **Three more smoke runs at stable code** (after A2 fix lands) → real σ
   per track at the new scoring shape.
