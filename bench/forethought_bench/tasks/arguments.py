"""Track 3: Argument Reconstruction.

Tests whether the agent can reproduce premise -> conclusion structure of
named arguments. Uses the required_elements list as a rubric.

Composite score per item:
  0.7 * elements_score    (fraction_at_least_partial: PRESENT counts 1.0, PARTIAL 0.5)
  0.3 * citation_faithfulness
"""

from __future__ import annotations

import os
from typing import Any

from inspect_ai import Task, task
from inspect_ai.scorer import Score, Target, mean, scorer
from inspect_ai.solver import TaskState

from forethought_bench._versions import BENCHMARK_VERSION
from forethought_bench.corpus import Corpus
from forethought_bench.judges import ClaudeJudge, Judge, default_judge
from forethought_bench.schema import AgentOutput, Item, TrackName
from forethought_bench.scoring import (
    check_all_citations,
    faithfulness_score,
    score_required_elements,
)
from forethought_bench.tasks._common import (
    Tier,
    agent_solver,
    build_agent,
    items_to_dataset,
    load_items_for_track,
    resolve_content_dir,
)


@scorer(metrics=[mean()])
def arguments_scorer(corpus: Corpus, judge: Judge):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        rubric = await score_required_elements(
            item.question, output.final_answer, item.required_elements, judge
        )
        checks = await check_all_citations(output, corpus, judge)
        cit_summary = faithfulness_score(checks)

        composite = (
            0.7 * rubric.fraction_at_least_partial
            + 0.3 * float(cit_summary["score"])
        )
        n_present = sum(1 for e in rubric.elements if e.verdict == "PRESENT")
        n_partial = sum(1 for e in rubric.elements if e.verdict == "PARTIAL")
        explanation = (
            f"rubric: {n_present}/{rubric.n_total} present, "
            f"{n_partial} partial; "
            f"citations valid={cit_summary['valid']}/{cit_summary['n']}"
        )
        return Score(
            value=composite,
            answer=output.final_answer,
            explanation=explanation,
            metadata={
                "item_id": item.id,
                "item_tier": item.tier,
                "rubric": rubric.model_dump(),
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
def arguments(
    *,
    base_url: str = "http://localhost:3000",
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
) -> Task:
    """Track 3: Argument Reconstruction."""
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = _build_judge(judge_model)
    agent = build_agent(base_url)

    items = load_items_for_track(
        TrackName.ARGUMENTS, tier=tier, include_held_out=include_held_out
    )
    metadata: dict[str, Any] = {
        "track": "arguments",
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
        scorer=arguments_scorer(corpus, judge),
        metadata=metadata,
    )
