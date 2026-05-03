For this work, iterate on the librarian benchmarks. Figure out what's currently the main benchmarks, how we may iterate and improve. Do searching online, thinking and writing about these things. Work in other files than this one

Below this, enter current results and our best ideas for what things we could build to try improve the evals. It should be a lot less than \~300 words in total.

\-- NEVER EDIT ANYTHING ABOVE HERE --

## Current state (smoke, 2026-05-03 final_run)

Librarian n-weighted composite **0.629**. Per track: definitions 0.618 / claim_recall 0.544 / arguments 0.664 / synthesis 0.755. Boundary 0.750. **Citation pain point**: of 230 citations, 10% VALID, 51% REAL_BUT_UNSUPPORTIVE, 31% PARTIAL, 7% FABRICATED. Prose is fine — markers point at the right paper but a different sentence than the one being scored. Lit (GroUSE, FaithJudge, GaRAGe) puts the industry ceiling near 58.9% F1, so 10% → \~30% VALID would be a real win, not partial.

## What to work on next

1. **Split the citation grader** (A1+A2): sentence-anchored per-claim grader + per-document holistic grader. Fixes the granularity mismatch behind the 51% unsupportive bucket. Priority.
2. **Numeric word-form fix** (A3): drop the regex approach — use LLM-as-judge instead so word forms like `eightfold` are handled naturally.
3. **Keep n small**: do not lift sample size. Speed of iteration matters more right now.

## Dropped / not doing

- **Boundary track**: gate agent already decides whether to route to the librarian. Librarian should always try its best once it receives a query — testing it for refusal is testing the wrong thing. Remove boundary from the bench.
- **NLI as support judge**: not worth it, keeping LLM judge.
- **Held-out partition / lifting n**: not a priority.

## Backlog / parked ideas

- **Post-rationalization probe** (detail in `bench/iteration/05-post-rationalization-probe.md`): test whether the agent actually uses its sources or just attaches citations after the fact. Two methods — hide the documents and see if the answer changes; secretly corrupt the documents and see if the agent notices. Produces a `dependence_score`. Fun idea, not a priority right now.