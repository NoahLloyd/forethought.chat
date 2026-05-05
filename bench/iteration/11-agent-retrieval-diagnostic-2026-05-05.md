# Agent-side variance: retrieval-failure diagnostic (DRAFT 2026-05-05)

This is a draft scoped for after iteration/10 lands the judge-side fix.
Iteration/09 isolated two distinct variance sources:

1. **Judge variance** — same agent prose graded differently by the
   judge across runs. Iteration/10 fixed this with median-of-N on the
   rubric and integration scorers; the synthesis-track composite σ
   dropped 0.031 → 0.015 across r19/r20/r21 vs r22/r23/r24.

2. **Agent variance** — agent retrieves / synthesizes differently
   across runs, producing different prose. The smoking-gun case is
   `claim_recall_001`: the agent surfaces "~50%" in r19 and r21 but
   says *"the paper does not give a specific probability"* in r20.
   Same prompt, three different agent retrievals; the 0.5-weighted
   correctness sub-scorer drops to 0 in r20.

Multi-judge median doesn't help case (2): three judges grading "the
paper does not give a probability" against target=0.5 will all return
INCORRECT. The fix has to be agent-side or bench-side, not judge-side.

## Two responses to agent variance

**Naive: agent retries.** Run the agent N times; pick the modal answer
or the best-of-N. Wallclock cost: N×. "Modal" is fuzzy on prose
because the agent's outputs aren't categorical. A mediocre version
exists — pick the answer with the highest composite — but that turns
the bench into a max-of-N benchmark, which over-states the agent's
true behavior in production.

**Diagnostic: retrieval-failure detector.** Don't change scoring; add
an *observable* — a per-item flag that fires when the agent's prose
indicates "no answer found" but the bench knows the answer is in the
corpus. The flag exposes how often the agent fails for retrieval
reasons vs comprehension reasons. It doesn't fix agent variance, but
it makes it visible.

Iteration/11 takes the diagnostic path. Reasons:

- The retry path conflates "what the agent does once" with "what the
  agent does at best". The bench's job is to grade the production
  behavior, not the lucky-draw behavior.
- The diagnostic gives us a metric we can watch over iterations as
  retrieval is tuned. Right now retrieval changes (BM25 weighting,
  chunk windowing) ship blind to bench-detectable failure modes.
- iteration/09 #3 explicitly flagged this as the "cheaper" option.

## Mechanism

Two pieces:

### 1. `is_present_in_corpus` precondition check

For items where the bench knows the right answer (numeric items with
`numeric_target`, recall items with `accepted_phrasings`), add a
preflight: can BM25 against the corpus surface a chunk that contains
the answer? Run once per item, cached on disk per (item, corpus)
hash, no LLM cost.

- For `numeric_target` items: scan the cited paper's body for the
  numeric value (with the same tolerance as the scorer). If found,
  mark `answer_in_corpus=True`.
- For `accepted_phrasings` items: lexical overlap between any
  accepted phrasing and the cited paper body. If overlap > threshold,
  mark `answer_in_corpus=True`.

Output: a boolean per item, attached to the item record. Items where
`answer_in_corpus=False` are item-design failures, not retrieval
failures, and should be fixed in the items file.

### 2. `agent_no_answer` detector on the agent's prose

Word-boundary-anchored regex with specific verb / noun completions —
unanchored alternations false-positive on quoted phrases like "digital
error correction does not protect" (a real-world example from r25
arguments_002 with an early prototype):

```python
NO_ANSWER_RE = re.compile(
    r'\b(?:'
    r'(?:paper|corpus|source) (?:does not|doesn\'?t)|'
    r'does not (?:give|provide|contain|state|mention|specify|directly address)|'
    r'doesn\'?t (?:give|provide|contain|state|mention|specify|directly address)|'
    r'not (?:stated|provided|specified|given|mentioned)|'
    r'no specific (?:probability|number|figure|answer|value|estimate|credence)|'
    r'(?:paper|corpus|source) is silent on'
    r')\b',
    re.IGNORECASE
)
```

Compose: items where `answer_in_corpus=True AND agent_says_no_answer=True`
are **agent retrieval failures** — the answer was retrievable but the
agent didn't surface it. Track this as a per-track / per-run rate.

```
agent_retrieval_failure_rate =
  | items where answer_in_corpus AND agent_says_no_answer | / | items |
```

Iteration/09 estimated `claim_recall_001` and `claim_recall_004` are
the dominant cases. Validation against r19/r20/r21/r25 logs (72
samples total) at the regex above: **1 true positive** (r20
`claim_recall_001`, exactly the iteration/09 case), **0 false
positives**. claim_recall_004 was *not* flagged across any run —
correctly, because the agent there confidently reports the *wrong*
number rather than declining to answer (see `iteration/09` for the
"agent confidently wrong" failure-mode distinction).

## Wiring

- Add `precondition.py` with `check_answer_in_corpus(item, corpus)`.
  Cached output stored alongside the item JSON or as a separate
  `_precondition.json` per items dir.
- Add `agent_says_no_answer(prose)` to a small `signals.py`.
- Score-time: every track's scorer composes both signals into the
  Score metadata: `{"agent_retrieval_failure": bool}`.
- `history.py` reads the bool, computes the per-track rate, displays
  in the run-detail table.
- Dashboard data loader also reads the bool.

## Acceptance criterion

Run the existing r19/r20/r21 logs through the new diagnostic offline
(no agent re-runs, no judge re-calls). For `claim_recall_001`:
- r19, r21 agent prose: detector fires? `agent_says_no_answer=False`
  (the agent said "~50%"). Not a failure.
- r20 agent prose: detector fires? `agent_says_no_answer=True` and
  the bench knows numeric_target=0.5 is in the corpus. Failure flagged.

Per-track agent retrieval failure rate matrix should match the
iteration/09 narrative: claim_recall_001 / claim_recall_004 are the
main contributors.

## Out of scope for iteration/11

- Agent retries (modal-of-N agent answers). Different design problem.
- Modifying the agent's retrieval strategy. Bench should observe, not
  prescribe.
- Auto-fixing items where `answer_in_corpus=False`. Hand-fix in the
  items file when the diagnostic flags them.

## Status

DRAFT. Lands when iteration/10 is closed out with a full-bench
passes=3 run (r25, currently in flight) confirming the σ reduction
extends to arguments and to the full composite.
