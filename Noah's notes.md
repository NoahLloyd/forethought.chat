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

**Variance has two distinct sources** (drilling into the two largest swings in iteration/09):

- `claim_recall_001` (range 0.534) is **agent variance**, not judge variance — the agent surfaces "~50%" in r19 and r21 but says *"the paper does not give a probability"* in r20. The 0.5-weighted correctness sub-scorer drops to 0 because the agent gave a wrong answer. Same prompt, different retrieval / synthesis. Multi-judge median wouldn't help; agent retries would.
- `synthesis_002_lock_in_window` (range 0.237) is **judge variance** — same agent prose (4.1–4.7K chars, similar shape across runs) but the elements_rubric judge said 3 PRESENT in r19/r20 then 5 MISSING in r21. Multi-judge median directly fixes this case.

**Most of `claim_recall`'s track-level σ comes from one item.** Per-item σ across r19/r20/r21: claim_recall_001 σ=0.285, the other 4 items all σ≤0.056. Track σ with item 001 = 0.051; without = 0.015 (well under iteration/06's 0.025 target). The variance picture is "one bad item dominating," not "the bench is broadly noisy."

**`claim_recall_004` is consistently *failing*** at composite ~0.40 (σ=0.014) — agent reliably can't surface the "geometric mean of 5X" passage despite the chunk being in the corpus and the agent correctly identifying the right paper. BM25 isn't returning that chunk on the agent's queries; agent ends up reporting 10X / 28X / 8X instead. Real agent-retrieval failure mode, not noise.

**Fabrication is 0% across all 3 confirmation runs**, but the r16→r19 cliff isn't what r19's note above claimed. Trajectory on arguments fab%: r15=8.2% → r16=**16.4%** (chunk_text + prompt rewrite cited more aggressively, often quoting markdown-link passages that the matcher couldn't find in the stripped `record.text`) → commit `841c3a4` fixed `corpus/loader.py::find_passage` to try both `record.text` and `record.body` → r19=0%. **The r16→r19 fab drop is the bench-side matcher fix, not the prompt.** The prompt rewrite is responsible for ~70% of the r15→r19 valid% gain (26→73 step) and pushed fab *up*; the matcher fix dropped fab to 0% and re-counted the previously-fab citations as valid (the 73→92 step is mostly recategorization). r19's "fabrication dropped due to citation discipline" attribution is backwards — the discipline rules improve `valid%`, not `fab%`. Full decomposition in iteration/09.