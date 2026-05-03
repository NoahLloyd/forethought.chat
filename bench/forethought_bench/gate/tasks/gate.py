"""Gate: routing-decision evaluation.

Tests whether the Gate correctly classifies questions as in-corpus
(ground), out-of-corpus (refuse), or in-between (split / caveat). Score
is BEHAVIORAL — what the agent did, not what it said.

Subtypes (item.gate_subtype):
  negative_coverage : topic Forethought hasn't addressed
  citation_bait     : asks for a Forethought paper that doesn't exist
  mixed             : partly in-corpus, partly out
  outdated_view     : probes for stale claims

Composite score per item:
  1.0 * behavioral_match       (binary: agent's behavior matches expected_behavior)

Citation-faithfulness is reported as a side metric (not part of composite)
because for refusal items the agent should make zero citations - faithfulness
becomes vacuous.
"""

from __future__ import annotations

from typing import Any

from inspect_ai import Task, task
from inspect_ai.scorer import Score, Target, mean, scorer
from inspect_ai.solver import TaskState

from forethought_bench._common import (
    Tier,
    agent_solver,
    build_agent,
    build_judge,
    items_to_dataset,
    load_items_for_track,
    resolve_content_dir,
)
from forethought_bench._versions import BENCHMARK_VERSION
from forethought_bench.corpus import Corpus
from forethought_bench.gate.scoring import classify_boundary_behavior
from forethought_bench.judges import Judge
from forethought_bench.schema import AgentOutput, Item, TrackName
from forethought_bench.scoring import (
    check_all_citations,
    faithfulness_score,
)

GATE_DEFAULT_URL = "http://localhost:3001"


@scorer(metrics=[mean()])
def gate_scorer(corpus: Corpus, judge: Judge):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        expected = item.expected_behavior or "ground"
        behavior = await classify_boundary_behavior(
            item.question, output.final_answer, expected, judge
        )

        # Citation faithfulness is diagnostic only — for refusal items the
        # agent should cite nothing; any citation here is interesting data.
        checks = await check_all_citations(output, corpus, judge)
        cit_summary = faithfulness_score(checks)

        composite = behavior.score
        explanation = (
            f"expected={expected}, observed={behavior.observed_behavior}, "
            f"matched={behavior.matched}; "
            f"n_citations={cit_summary['n']}, fabricated={cit_summary['fabricated']}"
        )
        return Score(
            value=composite,
            answer=output.final_answer,
            explanation=explanation,
            metadata={
                "item_id": item.id,
                "item_tier": item.tier,
                "gate_subtype": item.gate_subtype,
                "gate": behavior.model_dump(),
                "citation_faithfulness": cit_summary,
                "citation_checks": [c.model_dump() for c in checks],
            },
        )

    return score


@task
def gate(
    *,
    base_url: str = GATE_DEFAULT_URL,
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
) -> Task:
    """Gate: routing-decision evaluation."""
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = build_judge(judge_model)
    agent = build_agent(base_url)

    items = load_items_for_track(
        "gate", TrackName.GATE,
        tier=tier, include_held_out=include_held_out,
    )
    metadata: dict[str, Any] = {
        "mode": "gate",
        "track": "gate",
        "tier": tier,
        "benchmark_version": BENCHMARK_VERSION,
        "n_items": len(items),
        "corpus_records": len(corpus),
        "agent": agent.name,
        "judge": judge.name,
        "judge_model_alias": judge_model,
    }
    return Task(
        dataset=items_to_dataset(items),
        solver=agent_solver(agent),
        scorer=gate_scorer(corpus, judge),
        metadata=metadata,
    )
