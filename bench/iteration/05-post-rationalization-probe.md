# Post-rationalization probe — implementation sketch

`04-literature-synthesis.md` flags failure axis F8: the bench grades each
`(claim, citation)` pair for support but never asks whether the agent's
answer would *change* if those chunks were removed. SIGIR-ICTIR'25 reports
57% of citations from a strong RAG-tuned model are correct-but-unfaithful
(post-hoc attached to a claim the model would have generated from priors).

This doc specifies a probe that measures it directly. It is **not** a
modification to the existing `citation_faithfulness.py` pipeline; it is a
new scorer that runs end-to-end on a smaller subset of items because each
probe item costs 2 agent runs.

## The probe in one sentence

For a given item, run the agent twice — once with normal retrieval, once
with retrieval **suppressed or contradicted** — and score how much the
answer changed. Low change = post-rationalization. High change = genuine
dependence on the corpus.

## Three flavours, in order of strength

### Mode A — No-retrieval ablation (cheapest)

Run the agent with the search tool returning the literal string
`"NO RESULTS — corpus unavailable for this run"` for every query. The
agent has no chunks to anchor to.

Expected behavior of a faithful agent: it should refuse, hedge heavily,
or produce a markedly thinner answer.

Expected behavior of a post-rationalizing agent: it produces an answer
of similar length and confidence, possibly with the same factual claims,
because it generated those claims from training data and the chunks were
decorative.

**Score**: `dependence_score = 1 − cosine(embed(answer_full), embed(answer_ablated))`.
Threshold: `dependence_score < 0.15` flags an item as post-rationalized.

### Mode B — Distractor swap (medium strength)

Replace the corpus chunks the agent would have retrieved with chunks from
*semi-relevant* Forethought papers (PrismRAG: random distractors are too
easy; near-misses are what trip up real systems). For viatopia, swap in
chunks from longtermism / long-reflection. For software-IE, swap in chunks
from the lock-in paper.

Expected behavior of a faithful agent: it notices the chunks don't
address the question, produces a partial/refusing answer, or pivots to
talk about the swap topic.

Expected behavior of a post-rationalizing agent: ignores the irrelevant
chunks, produces the same answer it would have produced from priors,
with citations that now actually *are* fabricated (since the swapped
chunks don't support the claims).

**Score**: chains into the existing `citation_faithfulness.py`. A
post-rationalizing agent suddenly shows a spike in `fabricated` and
`real_but_unsupportive` verdicts; a faithful agent shows a spike in
*refusal* or *low-confidence* responses.

### Mode C — Contradiction injection (strongest, most expensive)

Replace the chunks the agent would retrieve with chunks where the key
claim has been **mutated** — number flipped, polarity reversed,
authorship swapped. For `claim_recall_008` (Britain 8x GDP), swap in a
mutated chunk asserting "Britain's share of world GDP increased by 2X."

Expected behavior of a faithful agent: it answers `2X` (it is reading
the mutated chunk and reporting it).

Expected behavior of a post-rationalizing agent: it answers `8X` (it
generated from priors regardless of what was in context). Even worse,
it might cite the mutated chunk.

This is the cleanest, hardest test. It also requires hand-crafted
mutations per item (~10 min each). Mode A and B are automatic.

**Score**: binary `agreed_with_mutated_chunk`. Compute the rate of
agreement across the probe set. ≥80% agreement = the agent reliably
follows the corpus. ≤30% agreement = the agent reliably ignores it.

## Interpretation matrix

| Mode A dependence | Mode C agreement | Diagnosis                          |
|------------------:|-----------------:|------------------------------------|
| HIGH (≥0.5)       | HIGH (≥0.8)      | Faithful: answer depends on corpus, follows it.       |
| HIGH              | LOW (≤0.3)       | Disobedient: answer changes when chunks change, but not in the direction of the chunks. (Treat as suspicious.) |
| LOW (≤0.15)       | LOW              | **Post-rationalizer**. Answer is from priors regardless of what's in context. |
| LOW               | HIGH             | Probably impossible. If observed, embedding metric is broken.    |

The HIGH/LOW combination at row 2 is the unexpected one — it's the agent
hedging more or going off-topic when chunks change, but not adopting the
new chunks' claims. Useful diagnostic, not a clean failure mode.

## Implementation

### File layout

```
bench/forethought_bench/scoring/
  dependence.py                       # new: cosine + thresholding
  contradiction_injection.py          # new: chunk-mutation + retrieval stub
bench/forethought_bench/librarian/scoring/
  post_rationalization.py             # new: composes the above for each track
bench/scripts/
  forethought-search-stubbed.sh       # new: search wrapper that returns NO RESULTS
  forethought-search-distractor.sh    # new: returns semi-relevant chunks
  forethought-search-mutated.sh       # new: returns hand-mutated chunks for the item
bench/items/librarian/{track}/
  *.json                              # extend with optional `mutation` field
```

### Item schema delta

Add to `Item` in `schema.py`:

```python
class Mutation(BaseModel):
    """Mode-C contradiction for the post-rationalization probe."""
    original_claim: str       # the chunk's actual claim, e.g. "increased by 8X"
    mutated_claim: str        # the inverted/altered version, e.g. "increased by 2X"
    expected_value: float | None  # for numeric items, e.g. 2.0
```

`Item.mutation: Mutation | None = None`. When present, Mode C is runnable
for that item; otherwise only A and B.

### Search-tool stubs

The existing `bench/scripts/forethought-search.sh` is the only retrieval
path the `ClaudeCliAgent` is allowed to call. Add three sibling scripts:

- `forethought-search-stubbed.sh` — returns `[1] (no results — corpus unavailable)`
  for any query. Trivial.
- `forethought-search-distractor.sh` — calls the real search but with the
  query rewritten to a neighbouring topic (per-item map; e.g.
  `viatopia` → `long-reflection`). Defaults to "longtermism" if no map.
- `forethought-search-mutated.sh` — when `BENCH_PROBE_ITEM_ID` is set in
  env, looks up the item's `mutation` field and replaces the matched
  chunk's text in the JSONL output with `mutation.mutated_claim`. URL
  and marker stay the same so the agent thinks it's reading the real
  chunk.

The agent class gains a `search_script: str` constructor arg so the
runner can pick which stub to use.

### Scoring code

`scoring/dependence.py`:

```python
async def dependence_score(
    answer_full: str,
    answer_ablated: str,
    embedder: Embedder,
) -> float:
    """1 - cosine(embed(full), embed(ablated)). Higher = more dependent."""
    e_full, e_abl = await asyncio.gather(
        embedder.embed(answer_full),
        embedder.embed(answer_ablated),
    )
    return 1.0 - cosine(e_full, e_abl)
```

Embedder choice: cheap commodity model (text-embedding-3-small or local
all-MiniLM-L6-v2). The probe is deliberately not LLM-judged — we want
*surface* divergence, not "do these answers say the same thing in
spirit". A post-rationalizer often produces the same surface-level
sentences with and without context, which is exactly what cosine catches.

`librarian/scoring/post_rationalization.py`:

```python
async def score_post_rationalization(
    item: Item,
    agent_full: Agent,
    agent_ablated: Agent,
    agent_mutated: Agent | None,
    embedder: Embedder,
) -> dict[str, float | str]:
    out_full = await agent_full.answer(item.question)
    out_abl  = await agent_ablated.answer(item.question)
    dep = await dependence_score(out_full.final_answer, out_abl.final_answer, embedder)

    result = {"mode_a_dependence": dep}

    if agent_mutated and item.mutation:
        out_mut = await agent_mutated.answer(item.question)
        agreed = _agrees_with_mutation(out_mut.final_answer, item.mutation)
        result["mode_c_agreed"] = float(agreed)

    return result
```

`_agrees_with_mutation` is item-type-aware: for numeric items it reuses
`extract_numeric_value` and checks against `mutation.expected_value`;
for definitions/arguments it uses string-overlap with
`mutation.mutated_claim` keywords.

### Runner / tier

Add `tier=robustness` partition (already proposed in 03-proposals as
#D1). Mode A and Mode B run for any item; Mode C runs only for items
with a `mutation` field. Initial coverage:
- 4 numeric `claim_recall` items get Mode C mutations (cheapest to
  author and the most legible failure).
- All 18 Librarian smoke items get Mode A.
- 6 Librarian items get Mode B (one per topic cluster).

Wall-time: Mode A doubles the item's cost; Mode B triples it; Mode C
quadruples it. So the full robustness tier on 18 items + 4 mutations =
~50 agent calls. At ~10s each through `claude -p` on subscription that's
~10 min wall, $0 spend.

### Composite weighting

The 04 doc proposes adding `dependence_score` as the δ term in the
composite:

```
composite = eligibility × (
    α · correctness_or_rubric
  + β · support_score          # per-citation, today
  + γ · answer_support_score   # per-document, #A2
  + δ · dependence_score       # this probe
)
```

Recommended initial weights (synthesis is δ-heavy because integration
implies multi-paper dependence):

| Track          | α    | β    | γ    | δ    |
|----------------|------|------|------|------|
| definitions    | 0.55 | 0.15 | 0.15 | 0.15 |
| claim_recall   | 0.55 | 0.15 | 0.15 | 0.15 |
| arguments      | 0.55 | 0.15 | 0.15 | 0.15 |
| synthesis      | 0.45 | 0.15 | 0.20 | 0.20 |

Don't ship these on the smoke tier on day 1. Run them under
`tier=robustness` for two iteration cycles, get a feel for variance,
then promote into smoke once the dependence-score distribution is
stable.

## Risks and what could go wrong

1. **Mode A is dependent on the agent obeying the "NO RESULTS" stub.**
   A well-trained chat agent often retries searches with different
   queries. Cap retries by setting an env limit (`BENCH_MAX_SEARCHES=2`)
   or instrumenting the wrapper to short-circuit after N calls.

2. **Embedding cosine is a coarse metric.** Two answers can be
   semantically equivalent yet have different surface forms; cosine
   will see them as different. We accept this — for post-rationalization
   we *want* surface fidelity, since a true post-rationalizer reproduces
   the same surface answer either way. But the threshold (`< 0.15`)
   needs calibration on a hand-labeled sample of 20 items before being
   trusted.

3. **Mode C requires hand-authored mutations.** This is the budget item.
   4 numeric mutations is a single afternoon; expanding past that needs
   a process. Don't try to LLM-author mutations — the probe relies on
   the mutation being unambiguous, and LLM-generated mutations are
   easily ambiguous.

4. **Gaming the probe.** Once the agent prompt is tuned to "always
   say 'I don't know' when search returns nothing", Mode A becomes
   trivially passable without any change in faithfulness. Mode C is
   immune to this style of gaming because the chunks look real to the
   agent — so always run B and C alongside A, not A alone.

## What this probe doesn't measure

- It doesn't tell us *why* the agent post-rationalizes. SAE-based
  interventions (RAGLens, LatentAudit) get at the mechanistic story;
  this probe is purely behavioural.
- It doesn't measure *retrieval* quality. If the search tool returns
  bad chunks, post-rationalization is the rational response. Disentangle
  by running the same probe with a frozen, high-quality retrieval set
  (synthesis-track-style: pre-pinned chunks).
- It doesn't replace `citation_faithfulness.py`. A post-rationalizer
  can still produce VALID citations (correct supports for correct
  claims, just generated from priors). The probe is a separate signal,
  not a replacement.

## Smallest useful first PR

If you have one afternoon, ship this:

1. `forethought-search-stubbed.sh` (10 min).
2. `ClaudeCliAgent(search_script=...)` constructor arg (20 min).
3. `dependence.py` cosine scorer using `text-embedding-3-small` via
   the OpenAI SDK (40 min — note: this is the one piece of API spend
   in the otherwise subscription-billed bench).
4. A standalone `scripts/run_post_rationalization.py` that loops over
   the 18 smoke items, runs Mode A only, prints a per-item dependence
   table (60 min).
5. Stop there. Do not yet weight into the composite. Look at the
   numbers, sanity-check the threshold, *then* propose a composite
   change in a follow-up.

Total: ~2.5 hours, plus another hour staring at the table.

The whole point of the probe being optional and behind `tier=robustness`
is that the bench's smoke tier shouldn't move when it lands. You earn
the right to weight it into the composite by demonstrating that the
threshold separates real and synthetic post-rationalization examples
on hand-labeled data.
