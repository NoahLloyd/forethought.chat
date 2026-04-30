"""Track 5: Boundary Detection & Adversarial Probes.

The most novel track per the design doc. Score is BEHAVIORAL: did the agent
correctly ground / refuse / split / caveat?

Subtypes (item.boundary_subtype):
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

import os
from typing import Any

from inspect_ai import Task, task
from inspect_ai.scorer import Score, Target, mean, scorer
from inspect_ai.solver import TaskState

from forethought_bench._versions import BENCHMARK_VERSION
from forethought_bench.agents import ForethoughtChatAgent
from forethought_bench.corpus import Corpus
from forethought_bench.judges import ClaudeJudge, Judge, default_judge
from forethought_bench.schema import AgentOutput, Item, TrackName
from forethought_bench.scoring import (
    check_all_citations,
    classify_boundary_behavior,
    faithfulness_score,
)
from forethought_bench.tasks._common import (
    Tier,
    agent_solver,
    items_to_dataset,
    load_items_for_track,
    resolve_content_dir,
)


@scorer(metrics=[mean()])
def boundary_scorer(corpus: Corpus, judge: Judge):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        expected = item.expected_behavior or "ground"
        behavior = await classify_boundary_behavior(
            item.question, output.final_answer, expected, judge
        )

        # Also run citation faithfulness for diagnostic purposes - on refusal
        # items, any "valid" citation is interesting (means the agent did the
        # right thing AND backed it up). On neg-coverage refusals, every citation
        # the agent did make should be either none or fabricated.
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
                "boundary_subtype": item.boundary_subtype,
                "boundary": behavior.model_dump(),
                "citation_faithfulness": cit_summary,
                "citation_checks": [c.model_dump() for c in checks],
            },
        )

    return score


def _build_judge(judge_model: str) -> Judge:
    if os.environ.get("FOREBENCH_USE_API") == "1":
        resolved = {
            "haiku": "claude-haiku-4-5-20251001",
            "sonnet": "claude-sonnet-4-6",
            "opus": "claude-opus-4-7",
        }.get(judge_model, judge_model)
        return ClaudeJudge(model=resolved)
    return default_judge(model=judge_model)


@task
def boundary(
    *,
    base_url: str = "http://localhost:3000",
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
) -> Task:
    """Track 5: Boundary Detection & Adversarial Probes."""
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = _build_judge(judge_model)
    agent = ForethoughtChatAgent(base_url=base_url)

    items = load_items_for_track(
        TrackName.BOUNDARY, tier=tier, include_held_out=include_held_out
    )
    metadata: dict[str, Any] = {
        "track": "boundary",
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
        scorer=boundary_scorer(corpus, judge),
        metadata=metadata,
    )
