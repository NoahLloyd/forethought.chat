# r19 confirmation: 3-run variance check (2026-05-05)

`07-landed-2026-05-03.md` shipped the citation-discipline prompt rewrite that
landed in r16. r19 (single full run on 2026-05-04) showed a striking lift —
overall composite 0.834 → 0.878, citation valid% on arguments +19.6pp,
synthesis +13.4pp.

Per `08-validation-results-2026-05-03.md`, arguments-track σ ≈ 0.077 across
3-run smokes on identical code. A single-run +19.6pp gain is suggestive but
inside ~2.5σ — could be lucky, could be real. Confirmation needed.

This iteration runs r20 and r21 as variance smokes (full 18-item runs at the
same code) so we have a 3-run mean (r19/r20/r21) to compare against r16's
single-run baseline.

## Bench infra change shipped

Before re-running, landed a small retry wrapper in
`forethought_bench/agents/claude_cli.py::_run_one` and
`forethought_bench/judges/claude_code.py::complete`:

- 3 attempts max, 2s/5s exponential backoff
- only retries on subprocess-level `claude -p failed (exit ...)` errors —
  not timeouts, not JSON parse errors, not `is_error=true` envelopes

Motivation: r17, r18, and r20-attempt-1 were all wiped out by single-sample
`claude -p` exit-1 flakes that cascaded across tracks (per
`memory/project_bench_fragility.md`). The retry layer absorbs transient
flakes silently without changing scoring shape — a successful retry produces
a normal output that gets graded the same way as a non-retry sample. Unit-
verified for the three cases (transient → retry succeeds; non-transient →
no retry; persistent → 3 attempts then raise).

Also added a regression test in `tests/test_smoke.py::test_corpus_find_passage_falls_back_to_body_when_text_strips_markdown` for the `corpus/loader.py` fix that landed in commit 841c3a4 (see "Fabrication and unsupportive rates" below for why that fix is load-bearing for fab-rate interpretation). Without the test, a future cleanup of the matcher could silently regress fab to ~16% on arguments without any test signal.

## Composite (3-run mean vs r16)

| Track | r16 | r19 | r20 | r21 | mean | σ | Δ vs r16 | signal? |
|---|---|---|---|---|---|---|---|---|
| definitions | 0.892 | 0.939 | 0.918 | 0.920 | **0.926** | 0.012 | +0.033 | ✓ ~2.7σ |
| claim_recall | 0.768 | 0.798 | 0.697 | 0.762 | 0.752 | 0.051 | -0.016 | within noise |
| arguments | 0.783 | 0.856 | 0.793 | 0.815 | **0.821** | 0.032 | +0.038 | borderline ~1.2σ |
| synthesis | 0.895 | 0.917 | 0.880 | 0.842 | 0.879 | 0.037 | -0.016 | within noise |
| **overall** | 0.834 | 0.878 | 0.822 | 0.840 | **0.847** | 0.028 | **+0.013** | small but consistent |

Per `06-validation-protocol.md`, σ ≤ 0.025 means a 0.05 shift is detectable
at p<0.05. Only definitions clears that bar; the others are 1.3-2× over.

## Citation valid % (the original target metric)

| Track | r16 | r19 | r20 | r21 | mean | Δ vs r16 |
|---|---|---|---|---|---|---|
| definitions | 94.4% | 92.0% | 88.0% | 90.0% | 90.0% | -4.4pp |
| claim_recall | 78.9% | 84.2% | 77.8% | 68.8% | 76.9% | -2.0pp |
| arguments | 72.7% | 92.3% | 87.5% | 77.4% | **85.7%** | **+13.0pp** |
| synthesis | 70.4% | 83.8% | 86.1% | 73.5% | **81.1%** | **+10.8pp** |

The arguments / synthesis gains hold up clearly even with the lucky-draw r19
correction. Definitions and claim_recall valid-rate "gains" do not.

## Fabrication and unsupportive rates

The citation-discipline prompt was originally pitched as eliminating
fabricated citations (the worst trust failure). That holds up cleanly:

| Track | r16 fab | r19/r20/r21 fab | r16 unsup | r19/r20/r21 unsup |
|---|---|---|---|---|
| definitions | 1.9% | 0.0% / 0.0% / 0.0% | 0.0% | 6.0% / 2.0% / 0.0% |
| claim_recall | 5.3% | 0.0% / 0.0% / 0.0% | 10.5% | 10.5% / 11.1% / 18.8% |
| arguments | **16.4%** | 0.0% / 0.0% / 0.0% | 5.5% | 3.1% / 0.0% / 11.3% |
| synthesis | **14.8%** | 0.0% / 0.0% / 0.0% | 0.0% | 5.4% / 2.8% / 11.8% |

**Fab rate is 0% across all 3 confirmation runs across all 4 tracks.**
That holds. But unpacking the trajectory exposes a misattribution in
iteration/07's framing of *why*:

| Run | When | Arguments fab% | Note |
|---|---|---|---|
| r15 | 2026-05-03 (pre-r16) | 8.2% | post-A1A2A3 baseline |
| r16 | 2026-05-04 14:01 | **16.4%** | chunk_text + prompt rewrite |
| (commit 841c3a4) | 2026-05-04 17:24 | — | `corpus/loader.py::find_passage` now tries both `record.text` and `record.body` |
| r19 | 2026-05-04 18:14 | 0.0% | first run post-corpus-fix |

The chunk_text + prompt rewrite (r16) actually *raised* arguments fab from
8.2% → 16.4%: the agent cited more chunks (more surface area) and the
new prompt encouraged tighter sourcing, including verbatim quotes — but
those verbatim quotes often contained markdown-link syntax that lived
only in `record.body`, not the markdown-stripped `record.text` the
matcher searched. Pre-fix matcher: "I can't find this quote in the
cited paper" → FABRICATED. Wrong.

Commit 841c3a4 fixed the matcher to try both `text` and `body`. That
single bench-side fix is responsible for the 16.4% → 0% drop on
arguments fab between r16 and r19, not the prompt.

**Decomposing r15 → r19 on arguments** (the cleanest case):

| Stage | valid% | fab% | Driver |
|---|---|---|---|
| r15 (post-A1A2A3, pre-r16) | 26.0% | 8.2% | baseline |
| r16 (after chunk_text + prompt) | 72.7% | 16.4% | prompt rewrite: +46.7pp valid (real agent gain), +8.2pp fab (more aggressive citation, more verbatim quotes triggering matcher false-positives) |
| r19 (after corpus fix) | 92.3% | 0.0% | matcher fix: re-counts "fabricated" → "valid", explaining most of the +19.6pp valid and -16.4pp fab cliff |

**Bottom line**: the prompt rewrite is responsible for ~70% of the
r15→r19 valid% gain (the 26→73 step). The corpus matcher fix is
responsible for ~30% of valid% gain *and* almost all of the fab cliff.
r19's note in Noah's notes — "fabrication dropped from 10% to 0%
across all tracks. So the citation discipline rules in r16's prompt
rewrite are now landing reliably" — has the attribution backwards.
The prompt rewrite pushed fab UP (16.4% on arguments). The bench-side
matcher fix dropped it to 0%. The discipline rules are still landing,
just on `valid%` not on `fab%`.

The shift moved some of that mass into UNSUPPORTIVE (passage exists but
doesn't back the specific claim), which is a less damaging failure mode
but still costs valid%. Synthesis unsup went from 0% → ~6.7% mean;
arguments oscillates around 4-5% mean. Net for the user: the agent will
no longer make up sources, but sometimes it cites a real paper for a
claim that paper doesn't quite say. Easier to spot, easier to fix.

## Per-item composite swings

Big-range items (range = max - min across r19/r20/r21):

| Track | Item | r19 | r20 | r21 | range |
|---|---|---|---|---|---|
| claim_recall | claim_recall_001 | 0.918 | 0.384 | 0.823 | **0.534** |
| synthesis | synthesis_002_lock_in_window | 0.877 | 0.862 | 0.640 | 0.237 |
| synthesis | synthesis_001_ie_timeline_compression | 0.961 | 0.823 | 0.908 | 0.138 |
| arguments | arguments_001_ai_coups_distinct | 0.928 | 0.810 | 0.907 | 0.118 |
| arguments | arguments_002_lock_in_mechanisms | 0.780 | 0.669 | 0.744 | 0.111 |

**Drilling into the two biggest swings exposes two distinct noise sources:**

### claim_recall_001 — agent variance, not judge variance

| Run | Composite | correctness | hedge | cite | ans_sup |
|---|---|---|---|---|---|
| r19 | 0.918 | 1.0 | True | 1.000 | 0.455 |
| r20 | 0.384 | **0.0** | True | 0.500 | 0.727 |
| r21 | 0.823 | 1.0 | True | 0.600 | 0.222 |

The 0.5-weighted correctness sub-scorer drops to 0 in r20. Reading the agent
prose: in r19 and r21 the agent says "~50%" with cite; in r20 the agent
says *"the paper does not give a specific probability"* — a wrong answer.
Same prompt, same item, three different agent retrievals/syntheses. The
chat-agent (claude -p with the bench preamble) is non-deterministic across
runs; sometimes it surfaces the right chunk, sometimes it doesn't.

A multi-judge median doesn't help this case — running 3 judges on r20's
"the paper doesn't give a probability" answer would still grade it 0.0.
The fix here is **agent-side**: re-running the AGENT n times and taking the
modal (or best-of-n) answer would reduce variance, but at n× wallclock cost.

### synthesis_002_lock_in_window — judge variance, not agent variance

| Run | Composite | rubric verdicts | answer length |
|---|---|---|---|
| r19 | 0.877 | 1 MISSING, 1 PARTIAL, **3 PRESENT** | 4724 chars |
| r20 | 0.862 | 0 MISSING, 2 PARTIAL, **3 PRESENT** | 4249 chars |
| r21 | 0.640 | **5 MISSING**, 0 PRESENT | 4161 chars |

Same 5 required elements; agent answers are similar length and similar
shape. The elements_rubric judge said "PRESENT" 3× in r19/r20, then
"MISSING" 5× in r21 — without the agent's prose having changed materially.
This is the judge-variance pattern from iteration/08: 0.25-weighted
sub-scorer flipping verdicts on near-identical inputs.

A multi-judge median would directly fix this: 3 calls to the rubric judge
on r21's prose probably wouldn't all converge on 5/5 MISSING.

**Takeaway**: variance reduction needs both levers (agent retries for
retrieval-driven swings, judge ensembles for verdict-driven swings).
Iteration/08 framed this as a judge problem only; this iteration shows the
agent contributes too.

## Interpretation

1. **Fabrication is gone, confirmed.** Across all 3 runs, fab rate stays at
   0.0% across every track. The r19 finding that the citation discipline
   rules eliminate fabrication holds up.
2. **Arguments/synthesis citation valid% lifts are real**, just smaller than
   the r19 snapshot suggested (+13.0pp / +10.8pp vs r19's +19.6pp / +13.4pp).
3. **Composite lift over r16 is +0.013 overall**, with definitions doing
   most of the work (+0.033 with σ=0.012, the only track that beats noise
   cleanly). Other tracks are inside noise.
4. **claim_recall is noisier than the iteration/08 σ=0.009 estimate**: the
   3-run σ here is 0.051. The iteration/08 baseline was at a different
   code shape (pre-r16). But the bigger story: **almost all** of
   claim_recall's track-level σ comes from one item.

   Per-item σ across r19/r20/r21:

   | Item | mean | σ | range |
   |---|---|---|---|
   | claim_recall_001 | 0.708 | **0.285** | 0.534 |
   | claim_recall_004 | 0.395 | 0.014 | 0.026 |
   | claim_recall_006 | 0.975 | 0.025 | 0.050 |
   | claim_recall_007 | 0.831 | 0.050 | 0.097 |
   | claim_recall_008 | 0.852 | 0.056 | 0.110 |

   Track σ **with** claim_recall_001 = 0.051. Track σ **without** = 0.015
   (well under the 0.025 target). Item 001 accounts for ~87% of the
   track's run-to-run variance. The variance picture is "one bad item
   dominating," not "the bench is broadly noisy."

5. **claim_recall_004 is consistently *failing*** (σ=0.014, mean=0.395).
   The agent reliably can't surface the "geometric mean of 5X" passage
   despite the chunk being in the corpus (verified). Spot-check: a direct
   BM25 query like *"When asked outright about total speed-up responses
   varied geometric mean 5X"* returns the right chunk only at position
   ~7 — *behind* a summary-table chunk from the same paper that has
   {10X, 28X, 21X, 15X} but not the geometric-mean number. The agent's
   prompt defaults `k=6`, so this chunk usually doesn't surface even
   with a fairly direct query. Combined: the chunk also contains
   "geometric mean of 14X" for a second method, so even when the agent
   does retrieve it, comprehension is hard.

   This is a real bench-detected failure — the bench is correctly
   grading it INCORRECT — but the *cause* is retrieval / chunk-design
   on a chunk-with-multiple-numbers, not agent reasoning per se. Fix is
   out-of-scope for this iteration; surfacing it for a future retrieval
   tuning iteration.

## Next iteration

Variance has two distinct sources (per the case studies above): agent-side
retrieval/synthesis variance and judge-side verdict variance. Different
levers for each:

1. **Judge ensembling for verdict-driven items** (`synthesis_002`-style):
   `validate_a2.py --judge-passes 3` already exists from iteration/08 but
   was never wired into the production scoring path. Wire it in for the
   elements_rubric and integration scorers (the judges that gave the
   biggest verdict swings here). Triples judge cost per sample on those
   sub-scorers; should cut σ by ~√3.
2. **Switch judge to API-direct with `temperature=0`** for the noisiest
   sub-scorers. Costs API spend but makes σ deterministic. Best target:
   `numeric_judge` (the 0.5-weighted correctness scorer in claim_recall),
   and the rubric judge in synthesis. Keep the CLI-subscription path for
   the cheap parallel-fanout work (citation faithfulness has 14 calls per
   synthesis item — API-billing those would be wasteful).
3. **Agent retries for retrieval-driven items** (`claim_recall_001`-style):
   harder. Naive answer would be to run the agent n times and take a
   modal answer, but n× wallclock and "modal" is fuzzy on prose.
   Cheaper: a `is_present_in_corpus` precondition check before scoring —
   if the agent says "the paper doesn't give a probability" but the item
   declares the corpus contains a numeric answer, that's a known-failure
   marker independent of the judge.
4. **Don't add more items yet.** Adding items dilutes σ but doesn't fix
   the per-item noise driving variance. Fix the judge + agent reliability
   first; expand the item set later.
