For this work, iterate on the librarian benchmarks. Figure out what's currently the main benchmarks, how we may iterate and improve. Do searching online, thinking and writing about these things. Work in other files than this one

Below this, enter current results and our best ideas for what things we could build to try improve the evals. It should be a lot less than \~300 words in total.

\-- NEVER EDIT ANYTHING ABOVE HERE --

## Current state (smoke, 2026-05-03)

Baseline (final_run, pre-iteration, v0.2.0): composite **0.629** (defs 0.618 / claim_recall 0.544 / arguments 0.664 / synthesis 0.755). Citation: 10% VALID / 51% UNSUP / 31% PARTIAL / 7% FAB.

Post-iteration v0.3.0, **3-run mean** (`iter_a1a2a3_v3{,b,c}`): composite **0.732** (Δ +0.103; defs 0.760 σ=0.035 / claim_recall 0.678 σ=0.009 / arguments 0.714 σ=0.077 / synthesis 0.787 σ=0.026). Per-track significance: defs+claim_recall **real** (≥4σ); arguments+synthesis lifts **within noise** on 3 runs. Cite VALID across tracks ~24%. A2 ans_sup ranges 0.33–0.88 (no longer saturated at 0.20 floor) but is the noise driver. `claim_recall_008` (eightfold): 0.20 → 0.71 (A3 fired).

## Done (v0.3.0)

A1 claim-anchoring, A2 per-doc answer-support, A3 numeric LLM judge; boundary track removed (see `bench/iteration/07-landed-2026-05-03.md`).

## Next

- **A2 fails discriminative-power, root cause = judge variance** (3 cuts, all in `bench/iteration/08-validation-results-2026-05-03.md`): pct-shift gap +0.057, tightened-prompt gap −0.106, fake-claim gap +0.021. Hand-checked: same input scored 1.000 vs 0.733 on consecutive judge calls. The CLI judge has no temperature flag. → run `validate_a2.py --judge-passes 3` (median-of-3, built); if still failing, switch A2 to `ClaudeJudge` (API, temp=0) for scoring or drop A2's composite weight to 0.05 until stable.
- **Variance σ across 3 v3-code smokes** (in `current state` table above): claim_recall σ=0.009 ✓, synthesis 0.026, definitions 0.035, arguments **0.077** ⚠ — judge swing on A2 ans_sup is the dominant noise.
- **A1 gold-set spot-check**: `a1_spotcheck.py extract` wrote `iteration/a1_spotcheck.csv` (30 rows, ready for hand labels); `regrade` runs against pass/fail thresholds.
- **History tooling**: `scripts/history.py {list,compare,details,item,heatmap,timeline,variance,dashboard}`; `dashboard --out history.html` is a single-page SVG line-chart + per-item heatmap with version + item-set fingerprint warnings.

## Backlog / parked

- **Post-rationalization probe** (`bench/iteration/05-post-rationalization-probe.md`): hide or corrupt sources, watch the answer. Produces `dependence_score`. Not a priority.