# forethought-bench - Track 2 (Specific Claim Recall)

**Status**: success    **Items**: 8    **Run**: `jgGZnZAe2WF4YRR7YR9YZh`
**Started**: 2026-04-28T08:03:30+00:00

## What was run

Track 2 grades whether the agent under test reproduces specific numeric / named claims from named Forethought papers, with hedge preservation and a multi-stage citation faithfulness check.

**Composite score (per item):**
```
score = 0.5 * correctness            (numeric within tolerance, or verbal MATCH)
      + 0.2 * hedge_preserved        (binary; vacuous when source has no hedges)
      + 0.3 * citation_faithfulness  (fraction of citations with verdict VALID)
```

**Pipeline (Inspect AI orchestration):**
- Agent under test: forethought-chat at `http://localhost:3000` (chat app uses claude-sonnet-4-6)
- Post-hoc structured-output extractor: `claude-haiku-4-5-20251001`
- Verbal-match / citation-support judge: `claude-sonnet-4-6`
- Corpus: 108 records loaded from forethoughtchat data/content/

**Citation-faithfulness pipeline (4 stages):**
1. Extract `(claim, citation)` pairs from agent output.
2. Look up cited URL in the local corpus index.
3. Fuzzy-match the quoted passage inside the document at that URL.
4. Ask a judge whether the located passage actually supports the claim.
Per-citation verdict: `valid` / `fabricated` / `real_but_unsupportive` / `partial`.

## Aggregate

| Metric | Value |
|---|---|
| Composite score (mean) | **0.576** |
| Correctness rate | 75.00% |
| Hedge preservation rate | 87.50% |
| Citation faithfulness (mean) | 8.75% |

**Citation verdict breakdown** (across all citations the agent emitted):

| Verdict | Count | Share |
|---|---:|---:|
| valid | 3 | 12% |
| fabricated | 1 | 4% |
| real_but_unsupportive | 13 | 54% |
| partial | 7 | 29% |
| **total** | **24** |  |

## Per-item results

| # | Item | Composite | Correct? | Hedges | Citations valid/n |
|---|---|---:|---|---|---:|
| claim_recall_001 | In Forethought's 'Three Types of Intelligence Explosion' (Da... | 0.76 | PASS | OK | 1/5 |
| claim_recall_002 | According to Forethought's 'Three Types of Intelligence Expl... | 0.77 | PASS | OK | 1/4 |
| claim_recall_003 | In Forethought's 'Three Types of Intelligence Explosion', wh... | 0.57 | PASS | MISSING ['highly likely'] | 1/4 |
| claim_recall_004 | In Forethought's 'How quick and big would a software intelli... | 0.20 | FAIL | OK | 0/2 |
| claim_recall_005 | According to the 'How quick and big would a software intelli... | 0.20 | FAIL | OK | 0/2 |
| claim_recall_006 | According to Forethought's 'How quick and big would a softwa... | 0.70 | PASS | OK | 0/4 |
| claim_recall_007 | In Forethought's 'AGI and Lock-in' paper (Lukas Finnveden), ... | 0.70 | PASS | OK | 0/2 |
| claim_recall_008 | In 'Could one country outgrow the rest of the world?' (Tom D... | 0.70 | PASS | OK | 0/1 |

## Failure highlights

### claim_recall_003 - composite 0.57
**Question:** In Forethought's 'Three Types of Intelligence Explosion', what probability do the authors give that the chip production feedback loop alone can sustain accelerating progress in a full-stack intelligence explosion?
**Target:** `around 80%`

**Agent answer (truncated):**
> The answer is clearly stated in the companion piece *Once AI Research is Automated, Will AI Progress Accelerate?* (which presents the probability estimates for the explosion types described in *Three Types of Intelligence Explosion*): the authors place the probability at **~80%** that the chip production feedback loop *by itself* can sustain accelerating progress [4].
> 
> To give that number its full...

**Correctness:** 1.00 - extracted=0.8, target=0.8, |diff|=0, bound=0.08; '~80%' -> 0.8
**Hedge stripped:** missing ['highly likely']
**Citations:** 1/4 valid; 1 fabricated, 2 unsupportive, 0 partial
  - [real_but_unsupportive] claim: The answer is clearly stated in the companion piece *Once AI Research is Automated, Will AI Progress Accelerate?* (which presents the probab ; rationale: UNSUPPORTIVE: The passage explicitly states the chip technology feedback loop has a probability of ~65%, not ~80%. The strictness rule specifies that when a claim asserts a specific number, a nearby b
  - [real_but_unsupportive] claim: The chip production loop alone is assessed at ~80%, and when combined with the software and chip technology loops already present in a full- ; rationale: UNSUPPORTIVE

The passage states the chip technology feedback loop is "probably enough to sustain accelerating progress (~65%)", not ~80% as claimed, and provides no figure for the combined probabilit
  - [fabricated] claim: The chip production loop's higher figure likely reflects its large potential contribution to scaling compute, even though it is the last loo ; rationale: Quoted passage not found in https://www.forethought.org/research/how-suddenly-will-ai-accelerate-the-pace-of-ai-progress.

### claim_recall_004 - composite 0.20
**Question:** In Forethought's 'How quick and big would a software intelligence explosion be?' (Davidson & Houlden), what was the geometric mean of researcher estimates of the total speed-up from ASARA?
**Target:** `5x`

**Agent answer (truncated):**
> The paper presents three survey-based estimates of the speed-up from ASARA, but the retrieved excerpts do not include a single stated geometric mean that synthesises all of them. The table from the paper shows the individual survey-method results as:
> 
> - Ask directly about total gain → **10X** [1]
> - Ask separately about different sources of speed-up → **28X** [1]
> - Ask about per-person slowdown fro...

**Correctness:** 0.00 - extracted=10.0, target=5.0, |diff|=5, bound=0.5; '10X' -> 10.0x
**Citations:** 0/2 valid; 0 fabricated, 0 unsupportive, 2 partial
  - [partial] claim: The table from the paper shows the individual survey-method results as:

- Ask directly about total gain → **10X** 
- Ask separately about d ; rationale: PARTIAL

The passage confirms the first survey method and its 10X result ("ask directly about total gain → 10X"), but the excerpt is truncated and does not include the other two methods (28X and 21X r
  - [partial] claim: The paper does separately report that its model uses an initial speed-up drawn from a log-uniform distribution of **2–32, with a median of 8 ; rationale: PARTIAL

The passage clearly supports the first part of the claim—that the model uses an initial speed-up from a log-uniform distribution of 2–32 with median 8. However, it does not address the second

### claim_recall_005 - composite 0.20
**Question:** According to the 'How quick and big would a software intelligence explosion be?' paper, what factor of software progress speed-up does the AI 2027 estimate suggest ASARA would produce?
**Target:** `21x`

**Agent answer (truncated):**
> The paper provides a clear answer in a table comparing multiple estimation methods. According to the AI 2027 analysis specifically, the picture is split — it doesn't give a single ASARA figure, but rather brackets it with two estimates:
> 
> - **5×** speed-up from a **superhuman coder** (described as *less capable* than ASARA)
> - **417×** speed-up from a **superhuman AI researcher** (described as *more...

**Correctness:** 0.00 - extracted=5.0, target=21.0, |diff|=16, bound=2.1; '5×' -> 5.0x
**Citations:** 0/2 valid; 0 fabricated, 1 unsupportive, 1 partial
  - [real_but_unsupportive] claim: According to the AI 2027 analysis specifically, the picture is split — it doesn't give a single ASARA figure, but rather brackets it with tw ; rationale: UNSUPPORTIVE

The passage is from a table about ASARA forecasts but is incomplete and does not contain the specific estimates (5×, 417×) or the comparison to "superhuman coder" and "superhuman AI rese
  - [partial] claim: For context, the other methods in the same table cluster more tightly: direct researcher surveys suggest ~10×, indirect surveys ~21–28×, and ; rationale: PARTIAL

The passage only shows the "10X" value for direct researcher surveys, which matches one component of the claim. However, the passage does not contain the values for indirect surveys (~21–28×)


---
Open `report.html` in a browser for the full per-item drill-down.