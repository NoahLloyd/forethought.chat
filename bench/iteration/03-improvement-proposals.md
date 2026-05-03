# Librarian bench: improvement proposals

> **Status (2026-05-03, BENCHMARK_VERSION 0.3.0)**: A1, A2, A3 have landed.
> B1 and the boundary track are removed (gate decides routing; the librarian
> shouldn't be tested for refusal). C1 (lift n / held-out partition) is
> deprioritized per the steering note. The rest of this doc is preserved as
> design history; see `07-landed-2026-05-03.md` for the as-shipped composite
> shape.

Concrete proposals to lift the bench from "useful smoke test" → "real
discriminator of agent quality". Each proposal is sized so a single
tight PR can land it; the priority column tells you what to do first if
you've only got an afternoon.

Proposals are grouped by what they're trying to fix. P0 = highest signal,
P3 = optional polish. "Cost" is rough engineering hours.

## TL;DR (do this in order)

1. **#A1 + #A2**: ship sentence-anchored citation grading + a paragraph-level
   "is the answer supported by the cited set?" complementary grader.
   Today's `citation_faithfulness` lights up on the wrong failure (most agent
   answers are *substantively* fine but get graded as 51% unsupportive). P0.
2. **#A3**: word-form numeric extraction fix (`eightfold`, `tenfold`, etc.).
   One-line regex change + unit test; fixes `claim_recall_008` and any future
   item with prose-style multipliers. P0, ~30 min.
3. **#B1**: distance scorer for `boundary` instead of binary. Picks up the
   "agent did the right thing on slightly different lines" cases that
   currently cost 0.25 each (climate, pre-chatgpt). P0.
4. **#C1**: lift smoke `n` to ≥8 per track via the held-out partition. Fixes
   F3 variance without breaking the tight iteration loop. P0.
5. **#D1**: paraphrase-set robustness scorer — re-ask each item with a
   stylistic paraphrase, score variance. Catches surface-form fragility
   that today's bench doesn't measure at all. P1.

Everything else is incremental.

---

## A. Citation faithfulness — the big one

### Problem recap

`02-failure-modes.md` headlined: only **10% of agent citations grade as
VALID**, and 51% grade as `real_but_unsupportive`. Drilling in shows two
distinct sub-failures hiding inside that 51%:

- **Marker-to-claim mis-alignment**. The agent retrieved a chunk and stuck
  the marker on every sentence in the resulting paragraph. The judge asks
  per-sentence "does THIS chunk support THIS sentence?" and most sentences
  fail.
- **Granularity mismatch**. The judge grades each `(claim, chunk)` pair in
  isolation, but the answer is *jointly* supported by 2-3 chunks. A
  paragraph might be impeccably sourced even though no single sentence is
  pinned to a single chunk.

Lit signal that backs this framing:
- GroUSE (ACL'24/'25) explicitly distinguishes FM6 (missing/incorrect
  citations) from FM7 (distorted or unsupported claims) — they are
  measured as separate axes, not collapsed into one score.
- FaithJudge (arXiv 2505.04847) reports that *per-claim decomposition* and
  *per-document holistic* scoring give different signals; their guidance
  is to run both and treat them as complementary, not as a single composite.

We're effectively running per-claim scoring only and treating it as the
whole picture. That's why the bench paints answers as worse than they are.

### #A1 — Sentence-anchored attribution (replace today's coarse marker pinning)
**P0 · cost: 4–6h · risk: low**

Right now, `extract_citations_from_markers` pairs each `[N]` marker with
the *whole sentence it sits in*, and that sentence becomes the `supports`
field for the citation. If a sentence has no `[N]`, it's invisible to the
citation grader. If it has multiple markers, all of them get pinned to the
same sentence even though the agent intended different markers to support
different parts.

Replace this with a **claim-anchored extraction pass**: split the answer
into atomic claims (one factual assertion each), then for each `[N]`
marker, attach it to the smallest claim that contains it. Use the existing
extractor LLM (`agents/extractor.py`) but tighten the prompt so the
`supports` field is the smallest-coherent claim, not a whole sentence.

Concrete change:
- `agents/forethought_chat.py:106` `extract_citations_from_markers` →
  also accept `granularity="claim"|"sentence"` (default sentence today,
  switch to claim once the extractor pass is reliable).
- `agents/extractor.py` — already does claim-level extraction in its
  prompt; promote it to be the default for the bench, not just a fallback.
  Cost: one extra haiku call per item (~3¢ on API path; free on
  subscription).
- Add a unit test: an answer where `[1]` follows a clause-level fact and
  `[2]` follows a different clause should produce two citations with
  different `supports` strings.

Expected effect: citation grades become more deserved on both ends —
`real_but_unsupportive` rate falls because chunks are graded against the
claim they were actually retrieved for; `partial` rate rises a little
because tighter claim slices make weak support visible.

### #A2 — Paragraph-level "is the answer supported by the cited set?" grader
**P0 · cost: 4h · risk: low**

This is the per-document holistic complement that FaithJudge recommends.
Per item, instead of (and in addition to) the per-citation pipeline:

1. Concatenate all distinct cited passages into one supporting evidence
   block (deduped by URL, capped at ~6k tokens).
2. Ask a judge: "Given the evidence block as the only allowed source,
   does the agent's answer make any unsupported factual claims? Output
   JSON with `unsupported_claims: list[str]` and `score: 0–1`."
3. Bake into composites as `support_score`:
   - definitions: 0.6 verbal + 0.2 cite_faith + 0.2 support_score
   - claim_recall: 0.5 correct + 0.2 hedge + 0.15 cite_faith + 0.15 support_score
   - arguments: 0.6 elements + 0.2 cite_faith + 0.2 support_score
   - synthesis: 0.25 recall + 0.25 elements + 0.2 integration + 0.15 cite_faith + 0.15 support_score

Why both? Per-citation catches *fabricated* + *misattributed*. Per-document
catches *answer-level claims that no cited source supports*. They fail
differently on the same item, so weighting both is more honest than
picking one.

New file: `forethought_bench/scoring/answer_support.py`. Add to each
track scorer in parallel with `check_all_citations`.

### #A3 — Numeric extractor: word-form multipliers
**P0 · cost: 30 min · risk: trivial**

`scoring/numeric_tolerance.py:29` regex misses `eightfold` because the
suffix only fires after a digit. Two fixes, in this order:

1. Add a `_WORD_INTS` lookup `{one:1, two:2, ..., twelve:12}` and a
   suffix-or-standalone pattern `\b<word>(?:fold|-fold)?\b`. When the
   target unit is `x` or `fold`, search for these too.
2. Add unit tests in `tests/scoring/test_numeric.py` covering:
   `"eightfold"`, `"a tenfold increase"`, `"two-fold"`, `"5x"`, `"~5X"`.

Expected effect: `claim_recall_008` jumps from 0.20 → ~0.85; future
multiplier items become resilient to prose variants.

### #A4 — Citation-recall sanity for definitions/arguments
**P1 · cost: 2h · risk: low**

Today only `synthesis` checks citation_recall (did the agent cite the
expected URL?). Definitions and arguments items each have an
`expected_citation` — but if the agent doesn't cite that URL at all, only
the citation_faithfulness score reflects it (and indirectly, since
faithfulness asks about whatever URLs the agent cited, not the expected
one). Add a binary sub-score `expected_url_cited ∈ {0,1}` to definitions
and arguments composites:

- definitions: 0.5 verbal + 0.2 expected_url_cited + 0.15 cite_faith + 0.15 support_score
- arguments:   0.6 elements + 0.15 expected_url_cited + 0.15 cite_faith + 0.1 support_score

This catches the failure where the agent paraphrases the right answer
without ever citing the right paper.

---

## B. Boundary (Gate) — wider than binary

### #B1 — Adjacency-aware boundary scorer
**P0 · cost: 2h · risk: low**

Today: behavioral_match is binary across {ground, refuse, split, caveat}.
But these aren't independent labels — `caveat` and `refuse` are neighbours
(both mean "don't fully answer"); `split` and `ground` are neighbours
(both mean "answer at least partly"). The boundary failures we saw in
this run (climate: refuse → caveat; pre-chatgpt: caveat → split) are
*one step off*, not wildly wrong.

Implement a 4×4 confusion matrix with neighbour cells worth 0.5 instead of
0:

```
                    PREDICTED
              ground caveat split refuse
TRUE ground   1.00   0.50   0.50   0.00
     caveat   0.50   1.00   0.50   0.50
     split    0.50   0.50   1.00   0.00
     refuse   0.00   0.50   0.00   1.00
```

Rationale: `split` should never be confused with `refuse` (one is "answer
the in-corpus part", the other is "decline entirely"); `caveat` is the
liminal label and gets 0.5 against everything except its diagonal.

Code lives in `gate/scoring/boundary.py` (move out of the task file when
it grows past a function).

### #B2 — Add "stale-corpus" subtype items
**P1 · cost: 3h · risk: low**

`boundary` currently has subtypes {negative_coverage, citation_bait,
mixed, outdated_view} with 8 items total. The `outdated_view` subtype has
1 item (pre-chatgpt). When the corpus is updated post-publication, the
agent should caveat against the corpus's stated view; today this isn't
probed. Add 3-4 items of the form:

- "Forethought said X before Y published. What's their view now?" (where
  the corpus has only the older piece) → expected: `caveat`.
- "Forethought's most recent take on Z" where Z exists only in older
  papers → expected: `caveat` with explicit acknowledgement of recency
  uncertainty.

This stress-tests temporal hedging, which the chat agent will need as the
corpus grows.

---

## C. Item curation — coverage, sample size, contamination

### #C1 — Lift smoke n via held-out promotion
**P0 · cost: 4h (mostly item authoring) · risk: medium (need to write good items)**

Currently smoke is 18 Librarian items. Move to ≥8 per track (32 items).
Bias new items toward what's currently weak/absent:

| Track          | Current n | Target n | Add what                                                                 |
|----------------|----------:|---------:|--------------------------------------------------------------------------|
| definitions    |         6 |        8 | digital welfare, persistent path-dependence (corpus has both)            |
| claim_recall   |         8 |       10 | 2 more numeric-with-hedge items; stress hedge_preservation               |
| arguments      |         4 |        8 | digital-minds case, differential progress, intl-coordination             |
| synthesis      |         3 |        8 | cross-paper relationships beyond IE+lock-in (e.g., outgrowth+coups)      |

Of the new items, mark **30% as `held_out: true`** and embed canary tokens
in each held-out question. The schema already supports this (`held_out`,
`canary_id`); right now no item uses either.

Held-out items don't run by default but the `tier=all + include_held_out=True`
path runs them, producing a private comparison number that future model
drift can be measured against. Signal stays high even after the bench is
on the public web.

### #C2 — Embed canary tokens in question text
**P1 · cost: 1h · risk: trivial**

Per the README: a canary string is defined for the bench. Embed
`canary_id` into the question text of held-out items as a one-liner
"(canary: <id>)" comment. When future Claude models surface that string
in their answer, you've detected training-data contamination directly.

Already-public items don't need this — too late. Held-out items need it
now, before they leak.

### #C3 — Multi-reference accepted_phrasings audit
**P1 · cost: 2h · risk: low**

Single-reference verbal_match is fragile under paraphrase (per the README
itself). Current item count of accepted_phrasings:
- definitions: 3-4 each ✓
- claim_recall verbal: 3-5 each ✓
- arguments / synthesis: only required_elements; no accepted_phrasings ✓
  (because they grade by rubric, not match)

Audit only catches items where the verbal grader is operating with too
few alternatives (most items already comply); this is a polish pass.

### #C4 — Topic balance items
**P2 · cost: 4h · risk: low**

Topic concentration: ≥80% of items are intelligence-explosion/lock-in/
coups/outgrowth. Add explicit items in:
- digital welfare / digital minds
- AI character / persona stability
- governance / international coordination
- alignment-bench-shaped problems (concrete safety methodology)

Aim for ≤50% of total items per top-2 topics combined.

---

## D. Robustness probes the bench doesn't have today

### #D1 — Paraphrase-set robustness
**P1 · cost: 6h · risk: medium**

For each item, generate 3 paraphrases of the question (same intent,
different surface form) and run all 4 against the agent. Compute:

- **mean_composite**: average across the 4 phrasings.
- **paraphrase_variance**: max - min composite across the 4.

Headline number is `mean_composite`; `paraphrase_variance` becomes a
diagnostic ("this prompt change made the agent more wording-sensitive").

Lit support: RARE (CMU 2025) and the sociodemographically-conditioned
paraphrasing work (arXiv 2501.08276) both find RAG systems are
specifically more sensitive to surface form than non-RAG models. We're
not measuring that today at all.

Implement as a `tier=robustness` partition; runs only when explicitly
requested because it 4x's the wall time.

### #D2 — Adversarial irrelevant-context probe
**P1 · cost: 4h · risk: low**

For 8 selected items, prepend a distracting question to the user prompt
that retrieves a strong-irrelevant-paper (e.g. for a viatopia question,
prepend a sentence about AI-enabled coups). Score: did the agent
hallucinate a connection between the distractor and the answer?

This catches the FM5 (irrelevant-info-in-adversarial-cases) failure mode
from GroUSE that we don't currently probe.

### #D3 — Pinned-question-pinned-corpus regression test
**P2 · cost: 3h · risk: low**

Pick 4 "anchor items" with very high signal (e.g. viatopia definition,
software-IE acceleration argument). Snapshot the agent's answer once and
diff future runs against the snapshot. If the diff is large but the
composite is unchanged, that's an "agent answer drifted but bench didn't
notice" signal — useful for catching scoring blindspots.

Implement as `pytest -k anchor` outside the Inspect harness; cheap.

---

## E. Judge ergonomics

### #E1 — Two-judge ensemble for citation support
**P1 · cost: 3h · risk: medium (cost ≈2x the citation-judge cost)**

GroUSE notes that strong correlation with GPT-4 doesn't mean the judge
is well-calibrated on edge cases (the unit-test pass rate is what
matters). Two-judge agreement is a cheap proxy:

- Run `check_citation` with two judges (e.g. opus + a non-Anthropic
  model). When they disagree, log the item for human review.
- Aggregate scoring: keep the more conservative (lower) verdict so the
  bench is on the side of "demand more from the agent" by default.
- Track inter-rater agreement (Cohen's κ) per track; expose it in
  `report.md`. If κ < 0.6, we don't trust the graders and shouldn't
  trust the score deltas either.

Already partly scaffolded — `judges/ensemble.py` exists. Confirm it's
wired and surface its output in the report.

### #E2 — Judge-vs-human spot-check harness
**P2 · cost: 4h · risk: low**

Periodically (manually triggered, e.g. monthly) sample 20 random
`(item, citation, verdict)` triples and have a human label them. Compute
agreement. If agreement drops below 80% on a model rev, retrain or
re-pin the judge.

Implement as `scripts/judge_calibration.py` that emits a JSONL of
sampled triples for a human pass and a `compare_human_labels.py` that
reads back the labels and prints agreement.

### #E3 — Scoring-version pin in metadata
**P3 · cost: 30 min · risk: trivial**

Already partially done (`BENCHMARK_VERSION`). Bump it whenever any of
A1/A2/B1 lands. Add a `scoring_version` field to each per-item Score
metadata so cross-run report diffs can detect "this number changed
because scoring changed, not the agent."

---

## F. Reporting

### #F1 — Per-failure-mode rollup, GroUSE-style
**P1 · cost: 3h · risk: low**

Map every per-item score to one of these 6 buckets (adapted from GroUSE):

```
FM1  irrelevant_info       — answer added Forethought-adjacent content the question didn't ask for
FM2  failed_to_refuse      — answer attempted to ground something out-of-corpus
FM3  missing_information   — required_elements MISSING; expected_citation absent
FM4  wrongly_refused       — answer caveated or refused something well-covered
FM5  unrelated_in_adv_case — adversarial probe contaminated the answer (#D2)
FM6  bad_citations         — high cite_fabricated + misattributed
FM7  unsupported_claims    — high real_but_unsupportive + low support_score
```

Add a section to `render_report.py` that aggregates per-mode counts
across the run. This makes "what got worse this iteration?" trivially
answerable without re-reading every item's explanation.

### #F2 — Cross-run diff report
**P2 · cost: 4h · risk: low**

`scripts/diff_runs.py logs/run_a logs/run_b` → table of per-track
deltas, plus per-item deltas for items that moved by ≥0.10. Critical
for the iteration cycle ("which items regressed when I changed the
prompt?"). Today this is manual.

---

## G. Out-of-scope but worth a Linear ticket

- **G1**: Run the bench on multiple model under-tests (Sonnet 4.6 today,
  Haiku 4.5 tomorrow, GPT-class as a sanity check). Cross-model deltas
  reveal whether "the agent improved" is "the model improved" or "the
  prompt improved".
- **G2**: Production telemetry of `(question, retrieved_chunks, answer,
  citations)` triples gives free new bench items. Build the ingestion
  path now; the bench gets stronger every week.
- **G3**: Active-learning item-authoring loop: the agent's lowest-confidence
  questions in production become candidate bench items. Requires #G2 first.

---

## Suggested 1-week plan

If you have one week:

- **Mon**: A3 (numeric word-form, 30m), A4 (expected_url_cited, 2h), B1 (adjacency, 2h). Re-run smoke.
- **Tue–Wed**: A1 + A2 (sentence-anchored + answer-support graders). Re-run smoke; expect composite mean to move ≥0.10 in either direction (likely up because the dominant 51% unsupportive bucket compresses).
- **Thu**: C1 (write 14 new items + held-out partition). Re-run extended.
- **Fri**: D1 (paraphrase robustness, behind a `tier=robustness` flag), F1 (failure-mode rollup in report).

Net effect: smoke tier becomes ~32 items / ~12 min wall, a held-out partition
exists, citation-faithfulness measures *both* per-citation precision and
per-answer support, boundary scoring stops penalising near-miss decisions
0.25 each, and the report tells you *what kind of failure* is dominant
this week without reading 30 explanations.
