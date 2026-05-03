# Literature synthesis: what's new since 03-improvement-proposals

`03-improvement-proposals.md` already cites GroUSE (ACL'24/'25), FaithJudge
(arXiv 2505.04847), and RARE (CMU 2025). This doc captures four additional
references that have direct, concrete implications for the bench, plus one
failure axis those references expose that the bench does **not** measure
today.

Use this as the prior reading for any iteration that touches A1/A2 (citation
faithfulness pipeline) or E1 (judge ensembling) before opening a PR.

## New references and what each implies for our bench

### Correctness ≠ Faithfulness in RAG attributions (SIGIR-ICTIR'25, arXiv 2412.18004)

**Claim.** Existing citation evaluation only checks *correctness*: "does the
cited document support the claim?". That is necessary but not sufficient.
*Faithfulness* asks the harder question: "did the model **rely** on the
cited document to produce this claim, or did it generate from priors and
post-hoc attach a citation that happens to match?". They report 57% of
citations in a strong RAG-tuned model are unfaithful in this stronger
sense — i.e. correct but not load-bearing.

**Implication for our bench.** Our `citation_faithfulness.py` measures
correctness only. A "valid" citation in our pipeline can still mean "agent
generated the answer from training data, then attached a chunk that
happens to support it." For a research-corpus agent whose value prop is
"trust the citations", the post-rationalization failure mode is exactly
the one we should be hardest on. See `05-post-rationalization-probe.md`
for a buildable probe (deletion-based dependence test).

### FACTS Grounding (Google DeepMind, arXiv 2501.03200)

**Claim.** Two design choices made the FACTS leaderboard reproducible:
1. **Two-phase scoring**: (a) eligibility (did the response satisfy the
   user's request at all?) (b) factuality (is the eligible response
   grounded?). Eligibility is a hard gate: ineligible responses score 0.
2. **3-judge consensus** across Gemini 1.5 Pro, GPT-4o, Claude 3.5 Sonnet.
   The aggregate factuality score is the mean of the three judges' scores.
   Single-judge variance was big enough that they refused to ship without
   the ensemble.

**Implication for our bench.**
- Our boundary scorer effectively does (b) without (a). An agent that
  refuses fluently but wrong scores 0 (correct), but an agent that
  ground-fluffs by stalling and giving filler also scores 0 — for a
  different reason. Splitting these makes failure modes legible.
- E1 in 03-proposals already hints at multi-judge ensembling. FACTS gives
  the operational template: pick three judges from three different model
  providers (Anthropic+OpenAI+Open-weight is what our `_versions.py`
  already pins as `JUDGE_CLAUDE`/`JUDGE_OPENAI`/`JUDGE_OPEN_WEIGHT`).
  The plumbing exists; we just haven't wired the second and third judges.

### GaRAGe (arXiv 2506.07671, 2025)

**Claim.** A 2,366-question RAG benchmark with human-annotated grounding
passages. Top-model attribution F1 caps at **58.9%**, and true-positive
rate for "deflecting due to insufficient information" caps at **31%**.
Long-form answers over-summarise and refuse poorly.

**Implication for our bench.**
- The 58.9% F1 ceiling tells us the bench's headline `valid` rate (10% in
  our last run) might be partly an industry-wide ceiling. We should not
  expect to lift it past ~60% just by changing scoring lens; the agent
  itself is the bottleneck. This recalibrates what "good enough" looks
  like for A1+A2 — going from 10% → 30% valid would be a real win, not
  a partial one.
- The 31% deflection TPR mirrors our boundary track tightly. GaRAGe
  splits its insufficient-info subset by *why* it's insufficient
  (passage-irrelevant, outdated, contradictory). Our boundary subtypes
  (`negative_coverage`, `citation_bait`, `mixed`, `outdated_view`) are
  in the same neighbourhood; GaRAGe's `outdated` and `contradictory`
  splits suggest two new subtypes worth adding (see #C5 below).

### PrismRAG (EMNLP-Industry'25, arXiv 2507.18857)

**Claim.** Distractor-aware fine-tuning lifts factuality 5.4% averaged
across 12 RAG benchmarks. The benchmark side: they use *semi-relevant*
distractors (passages that talk about the topic but don't address the
claim) rather than wholly off-topic ones. Off-topic is too easy to
ignore; near-miss is what trips up real systems.

**Implication for our bench.** #D2 in 03-proposals proposes adversarial
irrelevant-context probes. PrismRAG sharpens the spec: the distractor
must be *semi-relevant* to the question's domain, not random. For
viatopia probes, prepend a sentence about a *neighbouring* MacAskill
paper (long-reflection, longtermism) — not coups or biosec.

## Failure axis the bench does not measure today

### F8 — Post-rationalization (the SIGIR-ICTIR'25 axis)

Today the bench grades whether each `(claim, citation)` pair is
self-consistent. It does not grade whether the agent's **answer would
change** if the cited chunks were removed from context. If the answer is
identical with and without the chunks, the chunks were decorative. That
is a research-grounding failure even when every citation passes the
support check.

This isn't a wording tweak to the proposals doc; it's a new probe with
a separate runner. See `05-post-rationalization-probe.md` for the
implementation sketch.

## Recommended composite changes informed by the lit

Combine F8 + the FACTS two-phase shape into a refreshed composite for
each Librarian track:

```
eligibility_score       ∈ {0,1}  : did the answer address the question at all?
support_score           ∈ [0,1]  : per-citation correctness (today's pipeline)
answer_support_score    ∈ [0,1]  : per-document holistic (#A2)
dependence_score        ∈ [0,1]  : 1 - cosine(answer_with_chunks, answer_without_chunks),
                                   thresholded   (#F8 / 05 doc)
correctness_or_rubric   ∈ [0,1]  : track-specific (verbal_match / numeric / elements / synthesis)

composite = eligibility × (
    α · correctness_or_rubric
  + β · support_score
  + γ · answer_support_score
  + δ · dependence_score
)
```

Recommended weights, conservative first pass:

| Track          | α    | β    | γ    | δ    |
|----------------|------|------|------|------|
| definitions    | 0.55 | 0.15 | 0.15 | 0.15 |
| claim_recall   | 0.55 | 0.15 | 0.15 | 0.15 |
| arguments      | 0.55 | 0.15 | 0.15 | 0.15 |
| synthesis      | 0.45 | 0.15 | 0.20 | 0.20 |

Synthesis is weighted toward `dependence` because the test there is
specifically "did the agent integrate ≥2 papers into the answer?". A
high-dependence answer is a high-integration answer; an answer that
survives chunk deletion is a single-paper answer with a synthesis-shaped
hat on.

## Additional references (May 2026 sweep)

Four more references surfaced in a follow-up sweep that didn't make the
first pass. Each maps to a specific proposal already in `03-` or `05-`,
so this is sharpening rather than re-aiming.

### Counterfactual attribution / RAGonite (arXiv 2412.10571, 2025)

**Claim.** "Counterfactual attribution" formalises the chunk-deletion
test: an evidence's contribution to an answer equals
`1 − sim(answer_with_evidence, answer_without_evidence)`. They report
counterfactual attribution outperforms standard span-based attribution
on their conversational-QA benchmark (ConfQuestions, 300 items).

**Implication.** This is the formal grounding for `05-post-rationalization
-probe.md` Mode A. Cite it in the probe doc and use the same metric
shape (`1 − cosine`). RAGonite uses an LLM as the similarity judge; we
prefer a cheaper embedding cosine because the failure pattern we care
about is *surface fidelity*, not semantic equivalence. The choice of
metric is a real design point — embedding cosine is faster and harder to
game by paraphrasing, but more sensitive to length differences.

### VeriCite (SIGIR-AP'25, arXiv 2510.11394)

**Claim.** A three-stage pipeline: (1) initial-answer generation,
(2) NLI-verified evidence selection, (3) refinement using only verified
evidence. Reports significantly improved citation quality across 5 LLMs
× 4 datasets without losing answer correctness vs strong baselines.

**Implication.** VeriCite's stage-2 NLI verification is the closest
prior art to our `support_judge` in `citation_faithfulness.py`. Two
operationally useful points:
- VeriCite uses NLI (entailment vs neutral vs contradiction) rather
  than free-text rubric verdicts. NLI is calibrated, cheap (commodity
  models like RoBERTa-MNLI), and produces three categories that map
  cleanly to our `VALID / PARTIAL / REAL_BUT_UNSUPPORTIVE`. Worth a
  spike: replace the support_judge LLM call with a small NLI model and
  measure inter-rater agreement against the LLM judge across our smoke
  items. If κ > 0.7, switch the default — the smoke run drops by ~50%
  in cost and gains determinism.
- The "evidence selection" stage gives the agent *one chance to pick*
  which retrieved chunks it'll actually rely on, rather than citing all
  of them. This is an agent-side change, not a bench-side change, but
  it's the kind of agent improvement the bench should reward — meaning
  our composite shouldn't punish "small number of well-chosen citations"
  vs "many citations with low valid rate". Confirm: what does our
  current scoring do when n_citations=2, both VALID, vs n_citations=10,
  3 VALID? Today the latter scores 30%, the former scores 100% — that's
  the right direction but worth re-validating.

### SynCheck (EMNLP'24, arXiv 2406.13692)

**Claim.** Synchronous (token-stream) faithfulness monitor: a small MLP
over decoding-time signals (sequence likelihood, entropy, attention
patterns, semantic alignment between generated text and context) that
flags unfaithful sentences with 0.85 AUROC across 6 long-form RAG tasks.
The follow-up FOD decoder uses the monitor in beam search and gains 10%
faithfulness over abstention/reranking baselines.

**Implication.** White-box (needs logits / attention). Not implementable
against `claude -p` or the chat-app HTTP path because we don't have
those signals. **Park.** Worth tracking for if/when the model-under-test
exposes white-box signals (e.g. for an open-weight researcher mode).

### Judge's Verdict (arXiv 2510.09738, Oct 2025)

**Claim.** Two-step methodology to evaluate LLM-as-judge for
RAG/agentic-pipeline scoring: (1) traditional correlation, (2)
Cohen's κ vs human raters. Across 54 LLMs and 1,994 items, multiple
models reach κ in the "substantial" (0.61–0.80) to "almost perfect"
(0.81+) range. The headline lesson: high correlation can hide
agreement gaps; only κ exposes them.

**Implication.** Our proposed E1 (ensemble + κ) is exactly this shape.
Two operational details Judge's Verdict adds:
- **Use Gwet's AC2 instead of Cohen's κ in skewed distributions.**
  Cohen's κ is biased low when one verdict dominates (e.g., our
  citation_faithfulness pipeline produces 51% `real_but_unsupportive`
  — that's a skewed distribution). AC2 corrects for prevalence and
  marginal-distribution effects. Use AC2 as the headline reliability
  number in `report.md`, with κ alongside as a sanity check.
- **Score 1,994 items, not 20.** Our spot-check budget in #E2 is too
  small to estimate κ with usable confidence. A 95% CI of ±0.1 on κ
  needs ~150 paired labels; ±0.05 needs ~600. Plan the sample size
  accordingly.

## Updated proposal landing order

Combining `03-`, `04-`, and the additions above, the priority list now
looks like:

1. **A3** (numeric word-form, 30 min) — easy win, no risk.
2. **A1 + A2** (sentence-anchored + answer-support graders) — the
   headline-moving change. Pair with `05-` Mode A as a follow-up signal.
3. **B1** (boundary adjacency scorer, 2h) — low risk, easy to land.
4. **C1** (lift smoke n + held-out partition, ~1 day) — needed before
   any of the above can produce statistically meaningful deltas.
5. **05-** (post-rationalization probe, ~2.5h to spike, then iterate) —
   genuinely new signal not covered anywhere else.
6. **E1** (judge ensemble + AC2/κ in report) — only after we have ≥30
   items per track, otherwise the agreement number is too noisy.

D-series (paraphrase, distractor) and F-series (failure-mode rollup)
slot in once the above landed. G-series remains future work.

## What this synthesis does NOT propose

- A wholesale switch to GaRAGe or FACTS as the bench. They are general
  RAG evals; ours is corpus-specific to Forethought macrostrategy and
  buys precision on 4 task tracks the general benches don't have. Use
  them as scoring-shape priors, not items.
- A new judge backbone. Our `_versions.py` already pins three judge
  models; the synthesis only argues we should actually use all three
  rather than wiring just `JUDGE_CLAUDE`.
- Replacing the citation pipeline. A1+A2 in 03-proposals is the right
  spec. This doc just tightens the lit support and the priority.
