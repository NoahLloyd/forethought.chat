We are working and iterating on the librarian benchmarks for the forethought agent.

Next steps:

- We're trying to get high scores on citation valid % but our last runs only ran like a little part of the benchmark it seems. i am not fully understanding it. so try do a new run where you run everything, and consider deleting past runs that didn't properly run through the bench

\-- NEVER EDIT ANYTHING ABOVE HERE --

## r19 — full bench across all 4 tracks (2026-05-04)

Ran `LOG_DIR=logs/r19_full_baseline_across_all_4_librarian_tracks bash scripts/run_librarian.sh`. All 18 items, no interruptions. r17 (interrupted before arguments started) and r18 (only claim_recall) deleted.

**Composite: 0.878 (best so far, n=18). r16 was 0.834.**

Trackr16 valid%r19 valid%Δdefinitions94.492.0-2.4ppclaim_recall78.984.2+5.3pparguments72.792.3+**19.6pp**synthesis70.483.8+**13.4pp**overall81**89+8pp**

Most striking: **fabrication dropped from 10% (15 cases) to 0% across all tracks**. Real-but-unsupportive 3% → 5%, partial 6% → 5%. So the citation discipline rules in r16's prompt rewrite are now landing reliably.

Variance caveat (per `iteration/08`): arguments σ ≈ 0.077 across 3-run smokes. Single-run +19.6pp is suggestive but a 2-run (or 3-run) confirmation is needed before claiming the gain is real signal vs. lucky draw.

## r20–r21 — 3-run variance confirmation (2026-05-05)

Ran two more full bench runs at the same code to estimate variance properly. Also landed a small retry wrapper in `claude_cli.py::_run_one` and `claude_code.py::complete` (3 attempts, 2s/5s backoff, only on subprocess `exit !=0` errors) before the runs — first attempt at r20 hit a `claude -p exit 1` flake on synthesis (the same fragility pattern as r17/r18); retry-equipped r20 ran cleanly. See `iteration/09-variance-confirmation-2026-05-05.md` for full analysis.

### Composite (3-run mean vs r16)

| Track | r16 | r19 | r20 | r21 | mean | σ | Δ vs r16 | signal? |
|---|---|---|---|---|---|---|---|---|
| definitions | 0.892 | 0.939 | 0.918 | 0.920 | **0.926** | 0.012 | **+0.033** | ✓ ~2.7σ |
| claim_recall | 0.768 | 0.798 | 0.697 | 0.762 | 0.752 | 0.051 | -0.016 | within noise |
| arguments | 0.783 | 0.856 | 0.793 | 0.815 | **0.821** | 0.032 | **+0.038** | borderline ~1.2σ |
| synthesis | 0.895 | 0.917 | 0.880 | 0.842 | 0.879 | 0.037 | -0.016 | within noise |
| **overall** | **0.834** | **0.878** | **0.822** | **0.840** | **0.847** | 0.028 | **+0.013** | small but consistent |

### Citation valid % (the original target metric, 3-run mean vs r16)

| Track | r16 | r19 | r20 | r21 | mean | Δ vs r16 |
|---|---|---|---|---|---|---|
| definitions | 94.4% | 92.0% | 88.0% | 90.0% | 90.0% | -4.4pp |
| claim_recall | 78.9% | 84.2% | 77.8% | 68.8% | 76.9% | -2.0pp |
| arguments | 72.7% | 92.3% | 87.5% | 77.4% | **85.7%** | **+13.0pp** ✓ |
| synthesis | 70.4% | 83.8% | 86.1% | 73.5% | **81.1%** | **+10.8pp** ✓ |

**Bottom line.** r19's +19.6pp arguments / +13.4pp synthesis valid% lifts were partly lucky — the 3-run mean lifts settle at +13.0pp / +10.8pp. Still real, still large; just smaller than the single-run snapshot suggested. Composite gain over r16 is a more modest +0.013 overall, driven mostly by definitions (+0.033). claim_recall and synthesis composites moved within their per-track σ.

**Fabrication is gone, confirmed.** Across all 3 confirmation runs, fab rate stays at 0.0% across every track. The r19 finding that the citation discipline rules eliminate fabrication holds up.

**Outlier item: `claim_recall_001`** swung 0.918 → 0.384 → 0.823 across r19/r20/r21 (range 0.534) — judge stochasticity dominates this item's score. `synthesis_002_lock_in_window` also swung 0.877 → 0.862 → 0.640 (range 0.237). These are the noise sources iteration/08 already flagged: judge default-temperature with no exposed seed control. No code fix from this iteration; the multi-judge median path in iteration/08's "next steps" is still the right lever if the team wants tighter σ.