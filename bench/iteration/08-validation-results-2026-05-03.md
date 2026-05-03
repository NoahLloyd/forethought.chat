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

## A2 discriminative-power validation: FAIL on first cut

Run with `scripts/validate_a2.py --n 8` (8 final_run answers, mutate first
percentage by +25 points modulo 95):

| metric | observed | target | result |
|---|---|---|---|
| faithful mean | 0.748 | ≥ 0.85 | ⚠ |
| hallucinated mean | 0.691 | ≤ 0.55 | ⚠ |
| gap | +0.057 | ≥ 0.30 | ⚠ |

Two of eight pairs scored hallucinated *higher* than faithful — judge
stochasticity dominates the signal. Specifically the CLI judge runs at the
`claude -p` default temperature (no flag exists to set it to 0), so identical
inputs give different verdicts on consecutive calls. We confirmed this by
hand: same input scored 1.000 vs 0.733 on two consecutive runs.

### What we tried

1. **Tightened `ANSWER_SUPPORT_SYSTEM` prompt** — explicit instruction to
   walk every number/date/name in the answer against EVIDENCE, with concrete
   "MUST flag" examples for number swaps. Re-ran (in progress at time of
   write). Hypothesis: prompt anchoring reduces stochastic generosity.

### Other levers (not yet tried)

- **Multi-judge median**: call the judge 3× per input, take the median
  score / mode of the unsupported_claims set. Triples cost but cuts variance.
- **Switch to API judge for A2**: ClaudeJudge supports `temperature=0`
  cleanly. Requires `ANTHROPIC_API_KEY`; modest spend.
- **Different mutation**: the `fake-claim` mutation (append a fabricated
  attribution) is wired in (`--mutation fake-claim`). If A2 fails on subtle
  number-swaps but catches whole-claim hallucinations, that bounds A2's
  competence to gross hallucinations — still useful, but narrower than
  hoped.
- **Move A2's weight down**: until the gap stabilises ≥0.30, A2 is
  contributing noise rather than signal. The composite formula could
  drop ans_sup from 0.15-0.20 to 0.05 until the validation is green.

## Variance probe: 2 runs of same code

Two smokes on identical code (`iter_a1a2a3_v3` and `_v3b`):

| Track | mean | σ | range | σ≤0.025? |
|---|---|---|---|---|
| arguments | 0.737 | **0.093** | [0.671, 0.802] | ⚠ |
| claim_recall | 0.672 | 0.001 | [0.671, 0.673] | ✓ |
| definitions | 0.774 | 0.035 | [0.750, 0.799] | ⚠ |
| synthesis | 0.777 | 0.025 | [0.759, 0.795] | ✓ (borderline) |

The arguments track is the noisiest. Drilling in: `arguments_001`
swung 0.90 → 0.735 between runs because A2 ans_sup went 1.00 (0
unsupported claims) → 0.40 (12 unsupported). Same agent answer, same A2
code, same evidence — pure judge stochasticity. The CLI judge runs at
default temperature with no exposed seed control, so identical inputs
give different verdicts on consecutive calls.

**Implication for the +0.134 baseline → v3 lift**: σ_arguments=0.093
means the arguments track alone has a 95% CI half-width of ~0.18 on a
single smoke. The arguments lift (+0.138) is roughly 1.5σ — within
natural noise on a 2-run estimate. claim_recall (Δ +0.128, σ=0.001) is
genuinely far above noise. definitions (Δ +0.180, σ=0.035) is solid.
synthesis (Δ +0.039, σ=0.025) is marginal.

A 3rd smoke run (`iter_a1a2a3_v3c`) is in progress to tighten σ.

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

1. Re-run A2 validation with tightened prompt; if gap still <0.30, wire
   multi-judge median for A2 only and re-run.
2. Hand-label `iteration/a1_spotcheck.csv` (30 rows) and run regrade.
3. Three more smoke runs at v3 code → real σ per track.
4. If A2 still doesn't separate, lower its composite weight until it does.
