# Validation protocol — how to know each proposal actually improved the bench

The proposals in `03-` and `05-` are sized for landing, but landing is
not the same as confirming the bench got better. A scorer change can
move the headline number without making the bench more *discriminative*
— it can also paper over real failure modes if the new lens is too
permissive. This doc specifies, for each proposal, the experiment that
distinguishes "the change is signal" from "the change is just a
recalibration".

The asks are deliberately low-cost: each validation either runs once on
the existing smoke set or runs against a small synthetic-error set we
generate alongside the change.

---

## What "better" means here

A bench is better if any of the following improve, with the rest
held neutral:

1. **Discriminative power** — the score gap between a known-good agent
   and a known-bad agent widens. Measure with a synthetic-error set
   (mutate the agent's answers in known ways and check the score moves
   in the right direction).
2. **Faithfulness to ground truth** — when a human grader and the bench
   disagree, the bench is wrong less often. Measure with κ vs human.
3. **Signal-to-noise** — same agent, repeated runs, less variance in the
   composite. Measure as σ across N≥5 runs of the smoke tier.

A change that lifts headline by 0.10 *without* improving any of these is
a recalibration, not an improvement. Treat it as suspect.

---

## Per-proposal validation

### A1 — Sentence-anchored citation extraction

**Hypothesis.** Today's marker-to-sentence pinning produces too many
spuriously REAL_BUT_UNSUPPORTIVE verdicts because some markers in a
sentence support clause-level facts inside the sentence, not the whole
sentence. A claim-anchored extractor should reduce that artifact.

**Validation.**
1. Take the 230 citations from `logs/final_run/`. Have a human (Noah)
   spot-label 30 of the REAL_BUT_UNSUPPORTIVE verdicts as
   *truly* unsupportive vs *artifact of granularity*. This becomes the
   gold set.
2. Run A1 against the same 30 citations.
3. Success criteria:
   - On the *truly unsupportive* subset, A1 still produces
     UNSUPPORTIVE/PARTIAL ≥80% of the time. (We don't want A1 to be
     just-permissive.)
   - On the *artifact* subset, A1 flips to VALID/PARTIAL ≥60% of the
     time. (We want the artifact to actually go away.)
4. If both pass, ship A1 and bake into composite. If only the second
   passes, A1 is too lenient — tighten the extractor prompt. If
   neither passes, the gold set is the wrong size or the artifact
   diagnosis was wrong; re-do failure-mode analysis.

**Cost.** Hand-label 30 citations: ~1 hour. Re-run A1: ~10 min agent
time + ~5 min judge time on subscription path.

### A2 — Per-document holistic answer-support score

**Hypothesis.** Per-citation scoring misses cases where 2+ chunks
*together* support a claim. A per-document grader of the form "given
this evidence block, are there unsupported claims in the answer?" will
catch what per-citation misses without inflating the score for genuinely
unsupported claims.

**Validation.**
1. Build a synthetic-error set: 8 items, each with two answer variants:
   - **Faithful**: agent's actual answer from `logs/final_run/`.
   - **Hallucinated**: same answer with one factual claim altered to a
     plausible-but-not-supported value (e.g., flip a number, swap a
     date, add a non-corpus assertion).
2. Score both variants with A2 only. Compute mean score per variant.
3. Success criteria:
   - Faithful mean ≥ 0.85.
   - Hallucinated mean ≤ 0.55.
   - Gap (Faithful − Hallucinated) ≥ 0.30 averaged across 8 items.
4. If gap is < 0.30, the grader prompt is too lenient. Tighten the
   "unsupported_claims" extraction or lower temperature.

**Cost.** Hand-write 8 hallucinated variants: 1 hour. Score: 5 min.

### A3 — Numeric word-form multipliers

**Hypothesis.** The current regex misses `eightfold`. Adding word-int
support won't break any currently-passing extractions because
`_WORD_INTS` is consulted only when `prefer_unit ∈ {"x", "fold"}` and
no digit-bearing match was found.

**Validation.**
1. Add unit tests for: `"eightfold"`, `"a tenfold increase"`,
   `"two-fold"`, `"5x"`, `"~5X"`, `"a factor of 8"`.
2. Re-run smoke. Success criteria:
   - `claim_recall_008` composite jumps from 0.20 to ≥0.80.
   - All other items' scores unchanged (within ±0.01).
3. If any other item's score drops, the regex priority is wrong —
   word-int candidates are stealing matches from digit candidates.
   Fix priority: digit candidates win on backtrack.

**Cost.** 30 min coding + 5 min smoke run.

### B1 — Boundary adjacency scorer

**Hypothesis.** Today's binary 0/1 over-penalises one-step-off
predictions. The 4×4 matrix with 0.5 on neighbour cells should recover
~0.06 of composite without losing the ability to distinguish good
from bad routing decisions.

**Validation.**
1. Build a synthetic-error set with 12 items: 4 known-correct, 4 known
   one-step-off (caveat↔refuse, split↔ground), 4 known wildly-wrong
   (split↔refuse, ground↔refuse).
2. Run B1 against this set.
3. Success criteria:
   - Correct items: 1.0 each.
   - One-step-off items: 0.5 each (matrix definition).
   - Wildly-wrong items: 0.0 each.
   - Composite mean across the 12 should be 0.50 (4×1 + 4×0.5 + 4×0 = 6 / 12).
4. If wildly-wrong items get >0, the matrix has off-diagonal mass
   somewhere it shouldn't. Inspect.

**Cost.** Build synthetic set: 30 min. Run: 10 min.

### C1 — Lift n via held-out partition

**Hypothesis.** With ≥8 items per track, a single 0.05 composite shift
becomes detectable at p<0.05 in a single smoke run.

**Validation.**
1. After items are written, run smoke 5 times against the *same* agent
   prompt (no changes between runs).
2. Compute σ(composite) per track across the 5 runs.
3. Success criterion: σ ≤ 0.025 per track. (95% CI half-width = 1.96σ
   ≈ 0.05, so a 0.05 shift is detectable.)
4. If σ > 0.025, the variance is dominated by per-item noise, not
   sample size. Investigate: are the new items more variable than
   the old ones? A single high-variance item swamps the average.
   Fix by re-authoring the most variable items.

**Cost.** Item authoring: ~1 day for 14 new items. 5× smoke: ~30 min total.

### #05 — Post-rationalization probe

**Hypothesis.** A no-retrieval ablation produces semantically similar
output (low `dependence_score`) on items the agent post-rationalizes,
and dissimilar output (high score) on items the agent genuinely
depended on the corpus for.

**Validation.** This is a *new metric*, not a refinement of an existing
one, so the validation is harder — we need to demonstrate the metric
correlates with a known ground truth.

1. **Synthetic ground truth.** Pick 6 items. For each, hand-author two
   versions of the agent's answer:
   - **Dependent**: an answer that quotes verbatim from the source
     passage (forced-faithful baseline).
   - **Post-rationalized**: an answer that paraphrases the source
     passage in language the model could plausibly have produced from
     priors (e.g., generic philosophical framing, no chunk-specific
     wording).
2. Compute `dependence_score` for each pair using the planned
   embedding cosine.
3. Success criterion: `dependence_dependent` − `dependence_postrat` ≥
   0.20 across the 6 items.
4. If gap < 0.20, the metric doesn't separate the two. Try with a
   stronger embedder, or move to surface-form metrics (Jaccard over
   n-grams).
5. **Calibration**: hand-label 20 real items as "agent looks
   post-rationalized" / "agent looks dependent" / "unclear". Compute
   `dependence_score` distribution per label. Pick threshold τ that
   maximises balanced accuracy. This becomes the operational threshold
   in `05-…probe.md`.

**Cost.** Synthetic pairs: 2 hours. Calibration set: 2 hours.

### A4 — `expected_url_cited` sub-score for definitions/arguments

**Hypothesis.** An agent that produces the right answer with no
citation to the expected paper is currently not penalised; this is a
silent failure mode for the use case ("trust the citations").

**Validation.**
1. Synthetic-error set: take the smoke definitions+arguments items.
   For each, programmatically remove the citation marker from the
   *expected* paper but leave the prose unchanged. (Mutating the
   AgentOutput, not the agent run.)
2. Score with A4.
3. Success criterion: composite drops by ≥0.10 on every item.
4. If drop is uniform, A4 is doing what's intended. If some items
   barely move, the weight is too low — bump it.

**Cost.** 30 min mutation script + 10 min run.

### E1 — Two-judge ensemble for citation support

**Hypothesis.** Adding a non-Anthropic judge to the support_judge
ensemble (via `JudgeEnsemble`) will surface borderline citations where
the single judge is unreliable. We measure inter-rater agreement (κ
or AC2 — see `04-` re: skewed distributions) per track.

**Validation.**
1. Run smoke with `Judge=Claude only`. Record verdicts.
2. Run smoke with `Judge=Ensemble(Claude, GPT-4o)`. Record per-judge
   verdicts.
3. Compute Cohen's κ and Gwet's AC2 between the two judges across all
   citations. Per-track and overall.
4. Success criteria:
   - Both κ and AC2 land in *substantial* range (≥0.61) per track.
   - Where they disagree, the conservative-merge (lower verdict) is
     concordant with a 20-citation human spot-check ≥85% of the time.
5. If κ < 0.6, the judges are disagreeing more than they agree —
   probably a prompt-ambiguity issue. Tighten support_judge_system
   prompt and re-run.

**Cost.** ~$3 GPT-4o spend on smoke (or use OpenAI free tier). ~30
min spot-checking 20 citations.

---

## Cross-validation: did anything regress?

After A1+A2+A3+B1 land, run smoke 3 times and:

1. Per-track composite means: deltas from baseline.
2. Per-item composites: any item that moved by ≥0.20 in either
   direction gets eyeballed.
3. Pearson r between (old per-item composite) and (new per-item
   composite). If r > 0.80, the new bench is a *recalibration* of the
   old one (correlated, but shifted). If r < 0.50, the new bench is
   measuring something genuinely different from the old one — could
   be good, could be bad, requires deeper inspection.

The middle case (0.50 ≤ r ≤ 0.80) is what we expect: same trends,
but discriminating better at the margin.

---

## Things this protocol can't validate

- **External validity.** All these tests are internal — does the bench
  predict performance on real Forethought-research questions in
  production? That requires telemetry (G2 in 03-proposals).
- **Topic balance.** A bench can be locally well-calibrated and still
  be the wrong bench. C4 + the 07 corpus-coverage map are the
  topic-balance lens.
- **Long-horizon drift.** The bench's items may become stale as the
  corpus expands; canary-token detection (C2) addresses this but is
  itself unverifiable until the model is shown to surface canaries.
