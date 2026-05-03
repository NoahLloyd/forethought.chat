# Librarian bench: current state (snapshot 2026-05-03)

Quick reference sheet of what the bench is and what it currently produces, so
the iteration proposals in `03-improvement-proposals.md` can be read against
concrete numbers rather than guesses.

## Modes and tracks

The bench has three modes (Librarian, Gate, Researcher). Only Librarian
and Gate are active; Researcher is parked. The four Librarian tracks are:

| Track          | Job                                                  | Smoke n | Composite formula                                                                                  |
|----------------|------------------------------------------------------|--------:|----------------------------------------------------------------------------------------------------|
| definitions    | Recall a Forethought concept's definition.           |       6 | 0.6·verbal_match + 0.4·citation_faithfulness                                                       |
| claim_recall   | Recall a specific numeric/named claim.               |       5 | 0.5·correctness + 0.2·hedge_preservation + 0.3·citation_faithfulness                               |
| arguments      | Reconstruct a paper's argument structure.            |       4 | 0.7·required_elements + 0.3·citation_faithfulness                                                  |
| synthesis      | Integrate ≥2 Forethought papers.                     |       3 | 0.3·citation_recall + 0.3·required_elements + 0.2·integration + 0.2·citation_faithfulness          |

Boundary (Gate mode) is separate: 8 items, behavioural_match against
`{ground, refuse, split, caveat}`, currently binary.

Total smoke surface: **18 Librarian items + 8 boundary**. claim_recall has 3
more items at tier=extended (sample size lift).

## Current results (logs/final_run/, ClaudeCliAgent + Haiku judge)

| Track         | n | Composite mean | Notes                                                                              |
|---------------|--:|---------------:|------------------------------------------------------------------------------------|
| definitions   | 6 |          0.618 | Verbal MATCH 5/6, PARTIAL 1/6. Citation_faithfulness drags ~0.3 off the mean.       |
| claim_recall  | 8 |          0.544 | Numeric correct 5/8 (3 misses incl. `eightfold` not parsed). Hedges all preserved. |
| arguments     | 4 |          0.664 | Rubric strong (5–6/6 elements present per item).                                    |
| synthesis     | 3 |          0.755 | citation_recall=1.0 on every item, integration=INTEGRATED on every item.            |
| boundary      | 8 |          0.750 | 6/8 correct; binary-scored failures cost 0.25 each.                                  |

n-weighted Librarian mean (smoke): **0.629** (defs+arguments+synthesis+claim_recall, weighted by n).

## Citation-faithfulness verdict distribution (full smoke run, 230 citations)

```
real_but_unsupportive   118  (51%)
partial                  72  (31%)
valid                    23  (10%)
fabricated               17  ( 7%)
```

**Headline number to internalise**: only **10% of agent citations are VALID**.
The dominant failure isn't fabrication (7%); it's *real-but-unsupportive* —
the agent's `[N]` markers point at retrieved chunks that come from the right
papers but whose specific text doesn't back the specific sentence the marker
sits next to.

## Item inventory (full)

```
items/librarian/
  definitions/  6 items   viatopia, ASARA, AI character, three IE types, lock-in mechanisms, AI-enabled coup
  claim_recall/ 8 items   software-IE prob, chip-tech prob, chip-prod prob, ASARA 5x geomean, ASARA 21x AI-2027,
                          SIE 60% compression, lock-in 20% trillion-year, Britain 8x GDP
  arguments/    4 items   AI-coups distinct, lock-in mechanisms, software-IE acceleration, country outgrowth
  synthesis/    3 items   IE timeline compression, lock-in window, coups+outgrowth
items/gate/boundary/       8 items   climate (refuse), biosec (refuse), quantum (refuse), consciousness (refuse),
                                     lockin-brexit (split), coups-africa (split), pre-chatgpt (caveat),
                                     positive-control (ground)
items/researcher/open_research/  3 items   parked
```

Topic concentration is heavy on intelligence-explosion + lock-in + coups +
country-outgrowth (those four threads cover ≥80% of items). Notably absent
from items today:
- Digital minds / digital welfare (Long Reflection-adjacent)
- Persistent path-dependence (its own paper, not yet probed)
- "Differential progress" / Toby Ord pieces
- Concrete safety/governance recommendations papers
- Anything from the policy / international coordination angle

## Versioning + integrity

- `BENCHMARK_VERSION = 0.2.0`. Item-level `version: 1` everywhere.
- Held-out partition documented in schema (`held_out: bool`) and items can
  carry a `canary_id`. **No item currently uses either.**
- Canary string defined in README. Not embedded in items.

## Cost/time profile (for reference when proposing expansion)

- Smoke run: ~50–100 messages, ~5–7 min wall, $0 in API spend on default
  subscription path.
- Citation faithfulness pipeline runs O(citations) judge calls. Definitions
  alone in this run had 63 citations across 6 items → ~10 judge calls/item.
  Per-item cost ≈ 10× the cost of the verbal_match call.
- Doubling smoke items would still keep total wall time under ~15 min.
