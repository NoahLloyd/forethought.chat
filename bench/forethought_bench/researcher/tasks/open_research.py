"""Researcher / open_research: open-domain macrostrategy questions.

Forethought-adjacent macrostrategy questions Forethought hasn't directly
answered. Rubric grading on 4 axes; citation verification on whatever the
agent cited (a good open answer may cite Forethought for adjacent points
or cite nothing).

Status: this track is parked while the Researcher harness is unbuilt. It is
preserved here as the seed of a future evaluation; smoke runs of the
default product (Librarian) should not include it.

Composite score per item:
  0.7 * rubric_composite         (mean of 4 axes 1-5, normalized to [0,1])
  0.3 * citation_faithfulness    (vacuous=1.0 if 0 citations)
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
from forethought_bench.researcher.scoring import score_open_research
from forethought_bench.schema import AgentOutput, Item, TrackName
from forethought_bench.scoring import (
    check_all_citations,
    faithfulness_score,
)


@scorer(metrics=[mean()])
def open_research_scorer(corpus: Corpus, judge: Judge):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        rubric = await score_open_research(
            item.question, output.final_answer, judge
        )
        checks = await check_all_citations(output, corpus, judge)
        cit_summary = faithfulness_score(checks)

        composite = (
            0.7 * rubric.composite
            + 0.3 * float(cit_summary["score"])
        )
        explanation = (
            f"rubric: comp={rubric.comprehensiveness} depth={rubric.depth} "
            f"instr={rubric.instruction_following} read={rubric.readability}; "
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


@task
def open_research(
    *,
    base_url: str = "http://localhost:3000",
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
) -> Task:
    """Researcher / open_research: open-domain macrostrategy questions."""
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = build_judge(judge_model)
    agent = build_agent(base_url)

    items = load_items_for_track(
        "researcher", TrackName.OPEN_RESEARCH,
        tier=tier, include_held_out=include_held_out,
    )
    metadata: dict[str, Any] = {
        "mode": "researcher",
        "track": "open_research",
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
        scorer=open_research_scorer(corpus, judge),
        metadata=metadata,
    )
