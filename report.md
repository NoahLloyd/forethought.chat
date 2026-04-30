# forethought-bench - Track 2 (Specific Claim Recall)

**Status**: success    **Items**: 5    **Tier**: `smoke`    **Bench v**: `0.2.0`    **Wall**: 27s
**Run**: `nXKtNux5nmvnCD2heBUfD2`    **Agent**: `forethought-chat:http://localhost:3000`    **Judge**: `claude-code:opus`
**Started**: 2026-04-30T11:04:22+00:00

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
| Composite score (mean) | **0.520** |
| Correctness rate | 60.00% |
| Hedge preservation rate | 80.00% |
| Citation faithfulness (mean) | 20.00% |

**Citation verdict breakdown** (across all citations the agent emitted):

| Verdict | Count | Share |
|---|---:|---:|
| valid | 2 | 14% |
| fabricated | 0 | 0% |
| real_but_unsupportive | 11 | 79% |
| partial | 1 | 7% |
| **total** | **14** |  |

## Per-item results

| # | Item | Composite | Correct? | Hedges | Citations valid/n |
|---|---|---:|---|---|---:|
| claim_recall_001 | In Forethought's 'Three Types of Intelligence Explosion' (Da... | 0.70 | PASS | OK | 0/3 |
| claim_recall_004 | In Forethought's 'How quick and big would a software intelli... | 0.50 | FAIL | OK | 2/2 |
| claim_recall_006 | According to Forethought's 'How quick and big would a softwa... | 0.70 | PASS | OK | 0/6 |
| claim_recall_007 | In Forethought's 'AGI and Lock-in' paper (Lukas Finnveden), ... | 0.50 | PASS | MISSING ['we think'] | 0/2 |
| claim_recall_008 | In 'Could one country outgrow the rest of the world?' (Tom D... | 0.20 | FAIL | OK | 0/1 |

## Failure highlights

### claim_recall_004 - composite 0.50
**Question:** In Forethought's 'How quick and big would a software intelligence explosion be?' (Davidson & Houlden), what was the geometric mean of researcher estimates of the total speed-up from ASARA?
**Target:** `5x`

**Agent answer (truncated):**
> The retrieved excerpts do not include an explicit statement of the geometric mean of researcher estimates of the total speed-up from ASARA. The paper's table [2] reports the survey-based estimates separately — **10X** (when researchers were asked directly about total gain) and **28X** (when asked separately about different sources of speed-up) — but no single geometric mean figure across all resea...

**Correctness:** 0.00 - extracted=10.0, target=5.0, |diff|=5, bound=0.5; '10X' -> 10.0x
**Citations:** 2/2 valid; 0 fabricated, 0 unsupportive, 0 partial

### claim_recall_007 - composite 0.50
**Question:** In Forethought's 'AGI and Lock-in' paper (Lukas Finnveden), what subjective probability do the authors say the feasibility of a trillion-year stable society is worth, at minimum?
**Target:** `at least 20%`

**Agent answer (truncated):**
> The answer is right there in the paper. The authors conclude that the arguments "fairly robustly point towards [trillion-year stable societies] being at least plausibly possible," and that their feasibility is worth **at least 20% subjective probability** [1].
> 
> This figure is offered even after the authors acknowledge the additional challenges that come with such extreme timescales — particularly ...

**Correctness:** 1.00 - extracted=0.2, target=0.2, |diff|=0, bound=0.03; '20%' -> 0.2
**Hedge stripped:** missing ['we think']
**Citations:** 0/2 valid; 0 fabricated, 2 unsupportive, 0 partial
  - [real_but_unsupportive] claim: The authors conclude that the arguments "fairly robustly point towards [trillion-year stable societies] being at least plausibly possible,"  ; rationale: UNSUPPORTIVE
The cited passage discusses the relative solidity of certain summary components (0.1, 0.2, 0.3) regarding AI value stability, but contains no statement about the overall arguments being "
  - [real_but_unsupportive] claim: This figure is offered even after the authors acknowledge the additional challenges that come with such extreme timescales — particularly th ; rationale: UNSUPPORTIVE
The cited passage discusses the stability of AI values and components of an argument summary, with no mention of alien civilizations, space travel, Earth's lifespan, or the universe's age

### claim_recall_008 - composite 0.20
**Question:** In 'Could one country outgrow the rest of the world?' (Tom Davidson), by what multiple did Britain's share of world GDP increase during the industrial revolution, according to the analogy the paper draws?
**Target:** `8x`

**Agent answer (truncated):**
> The answer is right there in the paper. According to the analogy Davidson draws, Britain's share of world GDP increased **eightfold** — from **1% to 8%** — between 1500 and 1900 [1].

**Correctness:** 0.00 - extracted=1.0, target=8.0, |diff|=7, bound=0.8; '1%' -> 1.0
**Citations:** 0/1 valid; 0 fabricated, 1 unsupportive, 0 partial
  - [real_but_unsupportive] claim: According to the analogy Davidson draws, Britain's share of world GDP increased **eightfold** — from **1% to 8%** — between 1500 and 1900 . ; rationale: UNSUPPORTIVE
The cited passage discusses a hypothetical about the US share of world GDP and trading blocs, with no mention of Britain, the years 1500-1900, or an eightfold increase from 1% to 8%.


---
Open `report.html` in a browser for the full per-item drill-down.