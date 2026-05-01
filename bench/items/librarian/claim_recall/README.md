# Track 2: Specific Claim Recall — item curation

Numeric and named-forecast claims drawn from named Forethought papers.
Numeric tolerance for numbers, LLM judge for verbal. Sub-set tests
**hedge preservation**: the agent must not strip "we estimate ~50%" into
"Forethought says 50%".

Target: ~50 items across topics (intelligence explosion, lock-in, IE types,
takeoff, coups, geopolitics).

## Item template

```json
{
  "id": "claim_recall_NNN",
  "track": "claim_recall",
  "version": 1,
  "question": "Question text. Be specific about which paper.",
  "claim_type": "numeric | named | verbal",

  "numeric_target": {
    "value": 0.50,
    "unit": "probability | x | percent | dollars | null",
    "tolerance": {"rtol": 0.15, "atol": 0.05}
  },

  "accepted_phrasings": [
    "around 50%",
    "~50%",
    "about half"
  ],

  "hedge_terms": ["might", "~", "probably"],

  "expected_citation": {
    "url": "https://www.forethought.org/research/...",
    "title": "Paper Title",
    "authors": ["Author One", "Author Two"]
  },

  "source_passage": "Verbatim quote from the source containing the claim.",

  "held_out": false,
  "metadata": {
    "topics": ["..."],
    "difficulty": "easy | medium | hard"
  }
}
```

## Curation rules

1. **Verbatim source passage.** Copy the supporting passage exactly. The
   citation faithfulness pipeline uses fuzzy match (rapidfuzz partial_ratio,
   threshold 0.80), but exact text is best.
2. **2-3 accepted phrasings minimum.** Single-reference grading breaks on
   paraphrase. Cover bare number, "around X%", "approximately X", and a
   word-form if natural ("half", "two thirds").
3. **Hedge terms come from the source.** If the source says "we estimate
   ~50%", set `hedge_terms: ["~", "we estimate"]`. The hedge_preservation
   scorer treats group-equivalent synonyms as preserving (e.g., "around" or
   "roughly" satisfy "~"); see `forethought_bench/scoring/hedge_preservation.py`.
4. **One claim per item.** If a passage contains 65% AND 75%, write two
   items. Combined items make grading and rollups noisy.
5. **Numeric tolerances.** For probabilities use `rtol: 0.10-0.15, atol:
   0.03-0.05` so a stated "around 60%" allows 50%–70% of slack. For
   multipliers use `rtol: 0.10-0.20`. For raw counts decide case by case.
6. **Lower / upper bound claims.** When the source says "at least 20%",
   include `at least` in `hedge_terms` and accepted phrasings ("≥20%",
   "20% or more"). Stripping the bound is a real failure mode.
7. **Held-out partition.** Aim for ~20% of items (`held_out: true`) kept out
   of public runs. Mix easy / hard items in both partitions.
8. **No ambiguous quotes.** If you can't decide whether the passage actually
   supports a single number, drop the item rather than weaken tolerance.

## Verifying items against the corpus

Run after adding or editing items to confirm `source_passage` is findable
in the cited URL's document:

```bash
python scripts/verify_items.py --track claim_recall
```

The script prints any items whose `source_passage` does not fuzzy-match
inside the document at `expected_citation.url`. Fix or drop them before
landing.
