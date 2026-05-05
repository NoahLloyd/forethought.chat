"""Librarian / synthesis: cross-corpus synthesis.

Tests whether the agent integrates across multiple Forethought papers.
Items declare:
  expected_citations: list[CitationRef]   - required URLs (>= 2)
  required_elements: list[str]            - specific integration claims
  metadata.relationship: "agrees|disagrees|complements"

Composite score per item:
  0.25 * citation_recall            (fraction of expected URLs cited)
  0.25 * elements_score             (rubric on required_elements)
  0.20 * integration_quality        (LLM rubric: integrated vs. listed)
  0.15 * citation_faithfulness     (per-claim chunk-supports-claim grading)
  0.15 * answer_support             (per-document holistic: unsupported claims given the cited set?)
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
from forethought_bench.librarian.scoring import (
    score_citation_recall,
    score_integration,
)
from forethought_bench.schema import AgentOutput, Item, TrackName
from forethought_bench.scoring import (
    check_all_citations,
    faithfulness_score,
    refine_citation_claims,
    score_answer_support,
    score_required_elements,
)


@scorer(metrics=[mean()])
def synthesis_scorer(corpus: Corpus, judge: Judge, *, judge_passes: int = 1):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        expected_urls = [c.url for c in item.expected_citations]
        recall = score_citation_recall(output, expected_urls)

        relationship = str(item.metadata.get("relationship", "complements"))
        integration = await score_integration(
            item.question, output.final_answer, relationship, judge,
            passes=judge_passes,
        )

        rubric = await score_required_elements(
            item.question, output.final_answer, item.required_elements, judge,
            passes=judge_passes,
        )

        refined = await refine_citation_claims(output, judge)
        checks = await check_all_citations(refined, corpus, judge)
        cit_summary = faithfulness_score(checks)
        support = await score_answer_support(refined, corpus, judge)

        composite = (
            0.25 * recall.recall
            + 0.25 * rubric.fraction_at_least_partial
            + 0.20 * integration.score
            + 0.15 * float(cit_summary["score"])
            + 0.15 * support.score
        )
        explanation = (
            f"recall={recall.recall:.2f} ({len(recall.matched)}/{len(expected_urls)}); "
            f"integration={integration.verdict}; "
            f"rubric={int(round(rubric.fraction_at_least_partial * rubric.n_total))}/{rubric.n_total}; "
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
                "citation_recall": recall.model_dump(),
                "integration": integration.model_dump(),
                "rubric": rubric.model_dump(),
                "citation_faithfulness": cit_summary,
                "citation_checks": [c.model_dump() for c in checks],
                "answer_support": support.model_dump(),
            },
        )

    return score


@task
def synthesis(
    *,
    base_url: str = "http://localhost:3000",
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
    judge_passes: int = 1,
) -> Task:
    """Librarian / synthesis: cross-corpus synthesis.

    ``judge_passes>1`` runs the verdict-prone sub-scorers (rubric,
    integration) N times per item and majority-votes the verdict. See
    ``iteration/10-judge-ensembling-2026-05-05.md``.
    """
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = build_judge(judge_model)
    agent = build_agent(base_url)

    items = load_items_for_track(
        "librarian", TrackName.SYNTHESIS,
        tier=tier, include_held_out=include_held_out,
    )
    metadata: dict[str, Any] = {
        "mode": "librarian",
        "track": "synthesis",
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
        scorer=synthesis_scorer(corpus, judge, judge_passes=judge_passes),
        metadata=metadata,
    )
