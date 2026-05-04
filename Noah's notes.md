We are working and iterating on the librarian benchmarks for the forethought agent.

Next steps:

- We're trying to get high scores on citation valid % but our last runs only ran like a little part of the benchmark it seems. i am not fully understanding it. so try do a new run where you run everything, and consider deleting past runs that didn't properly run through the bench

\-- NEVER EDIT ANYTHING ABOVE HERE --

## r19 — full bench across all 4 tracks (2026-05-04)

Ran `LOG_DIR=logs/r19_full_baseline_across_all_4_librarian_tracks bash scripts/run_librarian.sh`. All 18 items, no interruptions. r17 (interrupted before arguments started) and r18 (only claim_recall) deleted.

**Composite: 0.878 (best so far, n=18). r16 was 0.834.**

| Track | r16 valid% | r19 valid% | Δ |
|---|---|---|---|
| definitions | 94.4 | 92.0 | -2.4pp |
| claim_recall | 78.9 | 84.2 | +5.3pp |
| arguments | 72.7 | 92.3 | **+19.6pp** |
| synthesis | 70.4 | 83.8 | **+13.4pp** |
| overall | 81 | **89** | **+8pp** |

Most striking: **fabrication dropped from 10% (15 cases) to 0% across all tracks**. Real-but-unsupportive 3% → 5%, partial 6% → 5%. So the citation discipline rules in r16's prompt rewrite are now landing reliably.

Variance caveat (per `iteration/08`): arguments σ ≈ 0.077 across 3-run smokes. Single-run +19.6pp is suggestive but a 2-run (or 3-run) confirmation is needed before claiming the gain is real signal vs. lucky draw.