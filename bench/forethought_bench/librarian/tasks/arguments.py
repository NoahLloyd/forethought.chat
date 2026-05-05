"""Librarian / arguments: argument reconstruction.

Tests whether the agent can reproduce premise -> conclusion structure of
named arguments. Uses the required_elements list as a rubric.

Composite score per item:
  0.6 * elements_score         (fraction_at_least_partial: PRESENT counts 1.0, PARTIAL 0.5)
  0.2 * citation_faithfulness  (per-claim chunk-supports-claim grading)
  0.2 * answer_support         (per-document holistic: any unsupported claims given the cited set?)
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
    refine_citation_claims,
    score_answer_support,
    score_required_elements,
)


@scorer(metrics=[mean()])
def arguments_scorer(corpus: Corpus, judge: Judge, *, judge_passes: int = 1):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        rubric = await score_required_elements(
            item.question, output.final_answer, item.required_elements, judge,
            passes=judge_passes,
        )
        refined = await refine_citation_claims(output, judge)
        checks = await check_all_citations(refined, corpus, judge)
        cit_summary = faithfulness_score(checks)
        support = await score_answer_support(refined, corpus, judge)

        composite = (
            0.6 * rubric.fraction_at_least_partial
            + 0.2 * float(cit_summary["score"])
            + 0.2 * support.score
        )
        n_present = sum(1 for e in rubric.elements if e.verdict == "PRESENT")
        n_partial = sum(1 for e in rubric.elements if e.verdict == "PARTIAL")
        explanation = (
            f"rubric: {n_present}/{rubric.n_total} present, "
            f"{n_partial} partial; "
            f"citations valid={cit_summary['valid']}/{cit_summary['n']}; "
            f"support={support.score:.2f} ({len(support.unsupported_claims)} unsupported)"
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
                "answer_support": support.model_dump(),
            },
        )

    return score


@task
def arguments(
    *,
    base_url: str = "http://localhost:3000",
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
    judge_passes: int = 1,
) -> Task:
    """Librarian / arguments: argument reconstruction.

    ``judge_passes>1`` runs the rubric judge N times per item and
    majority-votes the per-element verdict. See
    ``iteration/10-judge-ensembling-2026-05-05.md``.
    """
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = build_judge(judge_model)
    agent = build_agent(base_url)

    items = load_items_for_track(
        "librarian", TrackName.ARGUMENTS,
        tier=tier, include_held_out=include_held_out,
    )
    metadata: dict[str, Any] = {
        "mode": "librarian",
        "track": "arguments",
        "tier": tier,
        "benchmark_version": BENCHMARK_VERSION,
        "n_items": len(items),
        "corpus_records": len(corpus),
        "agent": agent.name,
        "judge": judge.name,
        "judge_model_alias": judge_model,
        "judge_passes": judge_passes,
    }
    return Task(
        dataset=items_to_dataset(items),
        solver=agent_solver(agent),
        scorer=arguments_scorer(corpus, judge, judge_passes=judge_passes),
        metadata=metadata,
    )
