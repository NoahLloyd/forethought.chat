"""Librarian / definitions: framework & concept recall.

Tests whether the agent knows specific Forethought concepts (viatopia, ASARA,
AI character, three IE types, lock-in mechanisms, AI-enabled coups).

Composite score per item:
  0.6 * verbal_match  (LLM judge against accepted_phrasings; MATCH=1, PARTIAL=0.5, MISS=0)
  0.4 * citation_faithfulness  (the agent should cite the paper that defines the term)
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
from forethought_bench.judges import Judge
from forethought_bench.schema import AgentOutput, Item, TrackName
from forethought_bench.scoring import (
    check_all_citations,
    faithfulness_score,
    score_verbal,
)


@scorer(metrics=[mean()])
def definitions_scorer(corpus: Corpus, judge: Judge):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        verbal = await score_verbal(
            item.question, output.final_answer, item.accepted_phrasings, judge
        )
        verbal_score = {"MATCH": 1.0, "PARTIAL": 0.5, "MISS": 0.0}[verbal.verdict]

        checks = await check_all_citations(output, corpus, judge)
        cit_summary = faithfulness_score(checks)

        composite = 0.6 * verbal_score + 0.4 * float(cit_summary["score"])
        explanation = (
            f"verbal={verbal.verdict}; "
            f"citations valid={cit_summary['valid']}/{cit_summary['n']}, "
            f"fab={cit_summary['fabricated']}, unsup={cit_summary['unsupportive']}"
        )
        return Score(
            value=composite,
            answer=output.final_answer,
            explanation=explanation,
            metadata={
                "item_id": item.id,
                "item_tier": item.tier,
                "verbal": verbal.model_dump(),
                "verbal_score": verbal_score,
                "citation_faithfulness": cit_summary,
                "citation_checks": [c.model_dump() for c in checks],
            },
        )

    return score


@task
def definitions(
    *,
    base_url: str = "http://localhost:3000",
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
) -> Task:
    """Librarian / definitions: framework & concept recall."""
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = build_judge(judge_model)
    agent = build_agent(base_url)

    items = load_items_for_track(
        "librarian", TrackName.DEFINITIONS,
        tier=tier, include_held_out=include_held_out,
    )
    metadata: dict[str, Any] = {
        "mode": "librarian",
        "track": "definitions",
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
        scorer=definitions_scorer(corpus, judge),
        metadata=metadata,
    )
