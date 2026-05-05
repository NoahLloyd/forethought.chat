# Median-of-N for verdict-prone scorers (2026-05-05)

`09-variance-confirmation-2026-05-05.md` identified two distinct
variance sources in the librarian bench:

1. **Judge variance** — same agent prose graded differently across runs.
   Worst case: `synthesis_002_lock_in_window` graded "3/5 PRESENT" twice
   then "5/5 MISSING" — 0.237 composite range with no input change.
2. **Agent variance** — agent retrieves / synthesizes differently across
   runs, producing materially different prose. `claim_recall_001` swung
   0.534 because the agent gave the right number twice and "the paper
   does not give a probability" once.

Iteration/09 listed four next-iteration levers; this iteration tackles
the judge-side one. Agent-side variance is the harder problem and
needs its own iteration.

## Mechanism

Add `passes: int = 1` to the verdict-prone scorers. When `passes > 1`,
run the judge N times in parallel (`asyncio.gather`) and aggregate.

- `score_required_elements` (rubric): per-element majority verdict.
  Tie-break by mean score (`PRESENT=1.0`, `PARTIAL=0.5`, `MISSING=0.0`,
  rounded back to the nearest verdict). Element rationale: pick the
  first pass whose verdict matched the majority. Recompute
  `fraction_present` and `fraction_at_least_partial` from the merged
  verdicts.
- `score_integration` (synthesis-only): majority verdict across passes,
  same tie-break rule. Rationale from the first pass that matched.

Why these two: iteration/09's two case studies showed both contribute
to synthesis-track noise (rubric on `synthesis_002`, integration is
0.20-weighted on every synthesis item). Both have categorical verdicts
where majority-vote aggregation is well-defined.

Why not the others (yet):

- `score_answer_support`: returns a list, not a verdict. Aggregation is
  ambiguous (median score? union of unsupported_claims? intersection?).
  Out of scope for this iteration; iteration/08 already validated it
  via `validate_a2.py --judge-passes` so we know median-of-3 helps,
  but wiring it into production needs a `merge_unsupported_lists`
  decision we don't have yet.
- `score_numeric_judge` / `score_verbal`: these are claim_recall /
  definitions correctness scorers (0.5 / 0.6 weighted). Iteration/09
  flagged these as best switched to API-direct `temperature=0` rather
  than median-of-N, because the failure mode is binary (right number
  vs wrong number) and the verdict is more deterministic per call.
  Median-of-3 on a deterministic call is wasted spend.
- `check_citation` / `check_all_citations`: per-citation faithfulness
  has a different aggregation question (multiple citations, each with
  their own verdict). Out of scope; tackle once per-claim verdicts are
  shown to be a noise source.

## Wiring

Add `judge_passes: int = 1` to both `synthesis` and `arguments`
@task functions (only synthesis uses integration; both use rubric).
Default `1` keeps the existing behavior — change is opt-in.

Plumb through to the @scorer factory and into the `await
score_required_elements(...)` and `score_integration(...)` calls.

Cost: at `judge_passes=3`, rubric + integration calls go from
2 calls/item to 6 on synthesis, and from 1 call/item to 3 on arguments.
Per item that's roughly 4 extra `claude -p` calls on synthesis
(~12-20s extra), 2 extra on arguments (~6-10s). Across the full bench
(13 items affected × ~10s overhead) that's ~2 minutes added to a full
run. Acceptable.

## Acceptance criterion

Run the synthesis track with `judge_passes=3`, compare against r19/r20/r21
synthesis means:

- `synthesis_002_lock_in_window` should not show a 5/5-MISSING run.
  The r21 verdict pattern was the smoking-gun outlier; with majority-vote
  it should pull toward the r19/r20 verdict pattern (mostly PRESENT).
- Track-level σ across 3 judge_passes=3 runs should drop below the
  pass=1 σ of 0.037.
- Track mean composite shouldn't *fall* — majority vote should be at
  worst neutral on items where the judge is consistent.

Per `06-validation-protocol.md`, σ ≤ 0.025 makes a 0.05 shift detectable
at p<0.05 — that's the longer-term target. This iteration just needs
to show movement in that direction without regressing the mean.

## Backout plan

If the smoke shows track mean falling materially (e.g. > 0.02 below
the pass=1 mean) the change can be reverted by removing the
`judge_passes` keyword from the @task functions; default behavior is
preserved.

## Results — judge-variance probe (r19 synthesis prose)

`scripts/probe_judge_variance.py --from-run logs/r19 --n-trials 3` ran
3 scoring trials at passes=1 and 3 trials at passes=3 on the same
r19-cached agent prose for each synthesis item, isolating *judge*
variance from agent variance. Per (item, scorer):

| Item | Scorer | passes=1 σ | passes=3 σ | range p=1 | range p=3 |
|---|---|---|---|---|---|
| synthesis_001 | rubric | 0.047 | 0.047 | 0.10 | 0.10 |
| synthesis_001 | integration | **0.236** | 0.000 | 0.50 | 0.00 |
| synthesis_002 | rubric | 0.047 | 0.000 | 0.10 | 0.00 |
| synthesis_002 | integration | 0.000 | 0.000 | 0.00 | 0.00 |
| synthesis_003 | rubric | **0.471** | 0.000 | 1.00 | 0.00 |
| synthesis_003 | integration | 0.000 | 0.000 | 0.00 | 0.00 |

Mean σ across the 3 items:

- **rubric**: passes=1 σ=0.189 → passes=3 σ=0.016 (**−91%**)
- **integration**: passes=1 σ=0.079 → passes=3 σ=0.000 (**−100%**)

Synthesis_003 rubric is the smoking gun: at passes=1 the score swung
from 0.0 to 1.0 across three trials on identical prose. At passes=3 it
locked at 1.0 across three trials. The judge consistently disagreed
with itself when scoring this item one-shot; majority-of-3 cuts through.

Synthesis_001 integration is the second-biggest swing: passes=1 σ=0.236
(verdicts wandering between PARTIAL and INTEGRATED across calls);
passes=3 locked at INTEGRATED.

Means held: rubric mean drift across all items was within ±0.033 of the
pass=1 mean. No track-level mean regression risk.

This was the core acceptance criterion. Implementation is sound; landing.

## Results — end-to-end synthesis smokes at judge_passes=3 (r22, r23, r24)

Three full synthesis-track runs at judge_passes=3 against the same code
(r19/r20/r21 are the passes=1 baselines from iteration/09). All four
runs use the same agent / item set; only `judge_passes` differs.

### Per-item composites (3 runs each setting)

| Item | r19 | r20 | r21 | mean p=1 | σ p=1 | r22 | r23 | r24 | mean p=3 | σ p=3 |
|---|---|---|---|---|---|---|---|---|---|---|
| synthesis_001 | 0.961 | 0.823 | 0.908 | 0.897 | **0.057** | 0.892 | 0.893 | 0.951 | 0.912 | 0.028 |
| synthesis_002 | 0.877 | 0.862 | **0.640** | 0.793 | **0.108** | 0.883 | 0.863 | 0.930 | 0.892 | 0.028 |
| synthesis_003 | 0.912 | 0.955 | 0.978 | 0.948 | 0.027 | 0.949 | 0.956 | 0.933 | 0.946 | 0.009 |

### Synthesis_002 rubric verdicts (the smoking-gun item)

| Run | passes | Verdicts | frac_at_least_partial | composite |
|---|---|---|---|---|
| r19 | 1 | M, Pa, P, P, P | 0.700 | 0.877 |
| r20 | 1 | Pa, Pa, P, P, P | 0.800 | 0.862 |
| r21 | 1 | **M, M, M, M, M** | **0.000** ← outlier | **0.640** |
| r22 | 3 | M, Pa, P, P, P | 0.700 | 0.883 |
| r23 | 3 | M, P, P, P, P | 0.800 | 0.863 |
| r24 | 3 | P, Pa, P, P, P | 0.900 | 0.930 |

The r21 "5/5 MISSING" outlier — the case iteration/09 used to motivate
this iteration — does not recur in any of the three passes=3 trials.
The rubric judge at passes=3 lands inside the r19/r20 verdict envelope
or above. Per-item σ on synthesis_002: **0.108 → 0.028 (-74%)**.

### Composite mean / σ summary

| Setting | runs | composite mean | composite σ |
|---|---|---|---|
| passes=1 | r19, r20, r21 | 0.879 | **0.031** |
| passes=3 | r22, r23, r24 | 0.917 | **0.015** |

Composite σ at passes=3 is ~52% lower than at passes=1. Per
`06-validation-protocol.md`'s "σ ≤ 0.025 detects a 0.05 shift at
p<0.05" target, passes=3 (σ=0.015) clears that bar; passes=1
(σ=0.031) does not.

Mean composite at passes=3 (0.917) is **+0.038** above passes=1
(0.879). The probe (which holds prose constant) showed median-of-3
doesn't shift the *judge* score distribution mean materially, only its
σ — so this 0.038 lift mostly reflects (a) agent-prose variance across
runs and (b) median-of-3 muting the *downward* tail (r21's 0.640) more
heavily than the upward tail. Either reading is fine for iteration/10:
no regression, σ reduction confirmed.

### Cost overhead

Wallclock per synthesis-only smoke (3 items, 8 max samples): roughly
1m45s at passes=1 vs 3m00s at passes=3 — ~70% wallclock overhead at
the synthesis track. Tolerable for the σ reduction.

## Outcome

Iteration/10 lands. Median-of-3 on the rubric and integration judges
takes the synthesis-track composite σ from 0.031 (passes=1) to 0.015
(passes=3), under the 0.025 detection bar from iteration/06, **without
regressing the mean** (mean shifted up +0.038, driven by muted
downside outliers). The probe (judge-only variance) showed -91% σ on
the rubric judge and -100% σ on the integration judge holding prose
constant — direct attribution of the σ-reduction to median-of-N.

The smoking-gun synthesis_002 case from iteration/09 (r21's 5/5
MISSING) is gone across all three passes=3 trials.

Next iteration candidates (per iteration/09's list):

1. **Wire judge_passes into arguments-track full benches.** The
   arguments scorer uses the same rubric judge (0.6-weighted), so this
   should be next-cheapest win. The probe + smoke design used here
   transfers directly.
2. **Switch `numeric_judge` and `verbal_match` to API-direct
   temperature=0.** These drive the 0.5/0.6-weighted correctness
   sub-scorer in claim_recall and definitions; iteration/09 flagged
   them as best targets for deterministic execution rather than
   median-of-N (binary right/wrong verdicts; majority vote on a
   deterministic call is wasted spend).
3. **Address agent-side retrieval variance for claim_recall_001-style
   items.** The `is_present_in_corpus` precondition idea from
   iteration/09 #3.


