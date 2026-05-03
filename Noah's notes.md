For this work, iterate on the librarian benchmarks. Figure out what's currently the main benchmarks, how we may iterate and improve. Do searching online, thinking and writing about these things. Work in other files than this one

Below this, enter current results and our best ideas for what things we could build to try improve the evals. It should be a lot less than \~300 words in total.

\-- NEVER EDIT ANYTHING ABOVE HERE --

## Current state (smoke, 2026-05-03)

Baseline (final_run, pre-iteration): librarian n-weighted composite **0.629** (defs 0.618 / claim_recall 0.544 / arguments 0.664 / synthesis 0.755). Citation pain: 10% VALID / 51% REAL_BUT_UNSUPPORTIVE / 31% PARTIAL / 7% FABRICATED on 230 citations. Lit ceiling \~58.9% F1.

## Done in this iteration (BENCHMARK_VERSION 0.3.0)

1. **A3 numeric LLM judge** (`scoring/numeric_judge.py`): drops regex word-form arms race; `eightfold` etc. handled naturally. Wired into `claim_recall`.
2. **A1 claim-anchoring** (`scoring/claim_anchoring.py`): pre-scores extractor pass that splits multi-marker sentences into per-clause supports text. Wired into all 4 librarian tracks before `check_all_citations`.
3. **A2 per-document answer-support grader** (`scoring/answer_support.py`): catches answer-level claims that no cited source supports + jointly-supported claims the per-citation lens misses. Wired into all 4 tracks.
4. **Boundary track removed**: deleted `gate/`, `items/gate/`, `run_gate.sh`, `BOUNDARY` enum, `boundary_subtype` and `expected_behavior` schema fields, render-report boundary path. Tests + imports green (34 passing).

New composites: defs `0.6 verbal + 0.2 cite_faith + 0.2 ans_sup`; claim_recall `0.5 correct + 0.2 hedge + 0.15 cite_faith + 0.15 ans_sup`; arguments `0.6 elements + 0.2 cite_faith + 0.2 ans_sup`; synthesis `0.25 recall + 0.25 elements + 0.20 integration + 0.15 cite_faith + 0.15 ans_sup`.

## Next

- Re-run smoke to measure delta vs baseline. Watch (a) cite_faith VALID rate (target: 10% → \~25-30%), (b) `claim_recall_008` (target: 0.20 → \~0.85 from A3), (c) per-track composite movement.
- Then consider validation per `06-validation-protocol.md` (gold-set spot check on A1 reduces "artifact" share of REAL_BUT_UNSUPPORTIVE; synthetic hallucinated-variant probe on A2).

## Backlog / parked

- **Post-rationalization probe** (`bench/iteration/05-post-rationalization-probe.md`): hide or corrupt sources, watch the answer. Produces `dependence_score`. Not a priority.