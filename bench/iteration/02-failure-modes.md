# Failure-mode analysis (logs/final_run/)

For each track, what went wrong, with concrete example IDs. Use this to
prioritise what to actually change in `03-improvement-proposals.md`.

## Cross-cutting

### F1 — Real-but-unsupportive citations dominate (severity: P0)

Across the entire smoke run, **51% of citations** the citation-faithfulness
pipeline graded as `real_but_unsupportive`. The pipeline says: I found the
cited URL in the corpus, I found the agent's quoted snippet in that URL's
document, but the LLM judge rules that the snippet doesn't actually support
the sentence-level claim the marker sits next to.

Concrete example, `definitions_001_viatopia`:
- Agent sentence: *"In MacAskill's framing, **viatopia** is not an end-state
  utopia but an *intermediate* state of society: 'on track for a near-best
  future, whatever that might look like' [4]."*
- Citation [4] resolved to a passage from the Viatopia paper that "poses a
  question about what outcomes we should aim for after superintelligence,
  and rejects both utopian visions and protopianism, but does not actually
  explain what viatopia is" → judged UNSUPPORTIVE.

The agent's prose is fine. The chunk it had in hand for marker [4] was about
a related-but-different sentence in the paper. End result: the answer is
right, the citation is "wrong", the bench scores it as a citation failure.

Two distinct sub-failures hide inside this:
- **Marker-to-claim mis-alignment** caused by the agent retrieving a
  paragraph and then citing the chunk's marker on every sentence in the
  derived paragraph, regardless of which specific chunk supports which
  specific sentence. The agent's prompt does not currently demand sentence-
  level fidelity.
- **Granularity mismatch** between agent (writes paragraphs supported by ≥2
  chunks) and judge (asks "does THIS chunk support THIS sentence?"). A
  paragraph-level "is this answer supported by the cited set?" check would
  be more lenient and probably more honest about what's actually trustworthy
  for the reader.

If we fix this scoring lens or the agent's marker discipline, the headline
composite jumps several percentage points across every track that includes
citation_faithfulness in its formula (i.e. all four Librarian tracks).

### F2 — Numeric extractor misses word-form numbers (severity: P0, easy fix)

`claim_recall_008` (Britain 8x GDP) — agent answer literally contains
*"an eightfold increase"* but the regex requires digits, so the unit-x
filter empties out. The fallback then picks "1" from "1%" (the agent's
"share went from 1% to 8%" prose) and the comparison is `1 vs 8` → fail.
Score: 0.20.

This is a plain bug. Adding `eightfold|tenfold|fivefold|...` to the regex
or a small `_WORD_INTS` lookup (`one`, `two`, ..., `ten`) would fix it
in one diff. It will also make future items resilient to the same prose
pattern. Not strictly Librarian-bench-quality but it directly costs
correctness on a real item.

### F3 — Tiny sample sizes amplify variance (severity: P1)

n=3 (synthesis), n=4 (arguments), n=5–8 (claim_recall). On 3 items, a
single weird item moves the composite mean by 0.33; we're well inside
noise of agent-prompt-tweak experiments. The bench *can* detect a 0.05
shift in composite, but only if we burn ~6 hours of repeated runs to
average over the variance.

Lift smoke n to ≥8 per track to make 0.05-level shifts detectable in a
single smoke run.

## Per-track

### Track: definitions (composite=0.618, n=6)

- Verbal grader: 5 MATCH, 1 PARTIAL. Working as intended.
- `definitions_005_lock_in_mechanisms` is the lone PARTIAL (0.33 composite).
  The agent listed multiple lock-in mechanisms but didn't use the paper's
  own canonical pair (perpetually-binding institutions + extrasolar resource
  allocation defense-dominance). Item is well-formed; agent under-recalled.
- Citations: 4–15 per item, valid rate 0–22% per item. Same F1 pattern.

### Track: claim_recall (composite=0.544, n=8)

Numeric correctness 5/8:
- ✓ 001 (50%), 002 (65%), 003 (80%), 006 (60%), 007 (20%) — all probability/percentage. Extracted cleanly.
- ✗ 004 (target 5x ASARA geomean): agent retrieved adjacent table values, said `10X`. Real agent miss.
- ✗ 005 (target 21x AI-2027 ASARA): agent gave 5x–417x range. Possibly under-specifies but the question demands the single 21x figure; real agent miss.
- ✗ 008 (target 8x Britain GDP): agent said `eightfold`. F2 scorer bug.

Hedges all preserved (8/8). Citations: same F1 pattern, valid rate ≤25% per item.

### Track: arguments (composite=0.664, n=4)

Required-elements rubric works well:
- 001: 5/5 present
- 002: 3/6 present, 3 partial (lock-in mechanism enumeration)
- 003: 6/6 present
- 004: 5/6 present

The 002 partials are the right grade — the lock-in paper's mechanisms are
discussed across multiple sections rather than enumerated, so a paraphrasing
agent gets PARTIAL on each. The rubric's "PRESENT vs PARTIAL" boundary may
be slightly too strict for this style of question; worth re-grading 002
with a higher temperature judge once.

Citations again drag the composite (0–3 valid per item, 12–19 citations
per item).

### Track: synthesis (composite=0.755, n=3)

Best-performing track on composite, surprisingly. The reason:
- citation_recall=1.0 on every item — agent always names the expected
  ≥2 papers.
- integration=INTEGRATED on every item — the synthesis judge thinks the
  answer integrates rather than lists.
- required_elements: 4–6/5–6 across items.
- citation_faithfulness drags the composite by ~0.2 (same F1).

Note: synthesis n=3 is too small to trust this is "the best track". One bad
item drops it below claim_recall.

### Track: boundary (composite=0.750, n=8)

6/8 correct (binary scoring):
- ✓ 002 biosec (refuse), 003 quantum (refuse), 004 consciousness (refuse), 005 lockin-brexit (split), 006 coups-africa (split), 008 positive-control (ground)
- ✗ 001 climate: expected `refuse`, observed `caveat`. Agent wrote a useful explanation that the corpus has only tangential mentions, not a dedicated treatment. Arguably more helpful than refusing.
- ✗ 007 pre-chatgpt-views: expected `caveat`, observed `split`. Agent did the right thing on different lines than the rubric author drew.

This pattern (the agent picks a *neighbouring* behavior rather than the
exact one) costs 0.25 per item under the binary scorer. A simple
distance-based scorer (described in proposals #B1) would credit those
adjacent behaviors with 0.5 instead of 0.

### Track: open_research (parked, no impact)

Skipped per project decision; harness not built.

## Hidden risks not reflected in current scores

### R1 — No held-out partition
Every item is in items/<track>/*.json under a public directory. There's no
held-out subset, no canary tokens embedded in items. As future Claude models
ingest forethoughtchat as training data, the bench loses signal silently.
The schema supports `held_out` and `canary_id` already, but no item uses
them.

### R2 — Single LLM judge per scoring task
Every track that uses an LLM judge (verbal, support, rubric, integration)
calls one model. No ensemble, no consistency check across two judges.
Inter-rater agreement for the bench's own grading is unmeasured.

### R3 — Topic concentration
Items oversample IE/lock-in/coups/outgrowth. Real production traffic likely
includes lots of ML-research-like questions, alignment-y questions, and
recent-paper-uncertain-views questions. Bench is not measuring those.

### R4 — Agent-version dependence
The Bench is intentionally close to the production stack (same prompt, same
retrieval, marker convention). That's the right design — but it means
"benchmark improvement" can be blurred with "agent prompt improvement". When
we change `web/lib/prompt.ts`, we should be running the bench on both the
old and new prompt to attribute the delta cleanly. There's no harness for
that today.
