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
