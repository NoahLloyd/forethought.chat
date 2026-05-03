For this work, iterate on the librarian benchmarks. Figure out what's currently the main benchmarks, how we may iterate and improve. Do searching online, thinking and writing about these things. Work in other files than this one

Below this, enter current results and our best ideas for what things we could build to try improve the evals. It should be a lot less than \~300 words in total.

\-- NEVER EDIT ANYTHING ABOVE HERE --

## Current state (smoke, 2026-05-03)

Baseline (final_run, pre-iteration, v0.2.0): composite **0.629** (defs 0.618 / claim_recall 0.544 / arguments 0.664 / synthesis 0.755). Citation: 10% VALID / 51% UNSUP / 31% PARTIAL / 7% FAB.

Post-iteration (`iter_a1a2a3_v3`, v0.3.0): composite **0.763** (Δ +0.134; defs 0.799 / claim_recall 0.671 / arguments 0.802 / synthesis 0.795). Cite VALID across tracks: 21–31% (target ≥25% met for arguments+synthesis). A2 ans_sup: 0.327–0.875 across tracks (no longer saturated at 0.20 floor). `claim_recall_008` (eightfold): 0.20 → 0.715 (A3 fired, but cite_faith+ans_sup drag the composite below the 0.85 target).

## Done in this iteration (BENCHMARK_VERSION 0.3.0)

A1 (claim-anchoring), A2 (per-doc answer-support), A3 (numeric LLM judge); boundary track removed; new composites all wire `cite_faith + ans_sup`. Full detail in `bench/iteration/07-landed-2026-05-03.md`.

## Next

- **Discriminative-power validation**: the +0.134 may be partly recalibration (ans_sup added 0.15–0.20 weight). Run `scripts/validate_a2.py` (synthetic %-shift probe — built; needs run) to confirm A2 separates faithful from hallucinated answers (target: gap ≥ 0.30).
- **Variance**: rerun smoke 3× → σ per track. Need σ ≤ 0.025 to call any 0.05 shift signal.
- **Worst items**: `claim_recall_004` (0.325) and `claim_recall_001` (0.752 down from 0.775) — check whether judge drift or genuine.
- **History tooling**: `scripts/history.py` lands `list / compare / details / item / timeline` over `logs/`, with benchmark-version + item-set fingerprint warnings on cross-version compares. Consider HTML chart next.

## Backlog / parked

- **Post-rationalization probe** (`bench/iteration/05-post-rationalization-probe.md`): hide or corrupt sources, watch the answer. Produces `dependence_score`. Not a priority.