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
   3-run σ here is 0.051. iteration/08 was on a 3-run smoke at the same
   code; this is at a different code shape (post-r16 rewrite) which may
   have introduced more per-item variance.

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
