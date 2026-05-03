"""Librarian / claim_recall: specific claim recall.

Composite score per item:
  0.5  * correctness          (LLM judge for numeric: handles "eightfold" etc., or verbal MATCH)
  0.2  * hedge_preserved      (binary; only counts when source had hedges)
  0.15 * citation_faithfulness (per-claim chunk-supports-claim grading)
  0.15 * answer_support       (per-document holistic: any unsupported claims given the cited set?)

Run patterns:
  Smoke (fast iteration):     5 items, ~15-20s with --max-samples=5
  Extended (broader coverage): 8 items, ~30s with --max-samples=8
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
    score_hedge_preservation,
    score_numeric_judge,
    score_verbal,
)


@scorer(metrics=[mean()])
def claim_recall_scorer(corpus: Corpus, judge: Judge):
    async def score(state: TaskState, target: Target) -> Score:
        item = Item.model_validate(state.metadata["item"])
        output = AgentOutput.model_validate(state.metadata["agent_output"])

        correctness, correctness_rationale = await _score_correctness(item, output, judge)
        hedge = score_hedge_preservation(output.final_answer, item.hedge_terms)
        refined = await refine_citation_claims(output, judge)
        checks = await check_all_citations(refined, corpus, judge)
        cit_summary = faithfulness_score(checks)
        support = await score_answer_support(refined, corpus, judge)

        composite = (
            0.5 * correctness
            + 0.2 * (1.0 if hedge.preserved else 0.0)
            + 0.15 * float(cit_summary["score"])
            + 0.15 * support.score
        )

        explanation = (
            f"correctness={correctness:.2f} ({correctness_rationale}); "
            f"hedge_preserved={hedge.preserved}; "
            f"citations valid={cit_summary['valid']}/{cit_summary['n']}, "
            f"fab={cit_summary['fabricated']}, unsup={cit_summary['unsupportive']}; "
            f"support={support.score:.2f} ({len(support.unsupported_claims)} unsupported)"
        )

        return Score(
            value=composite,
            answer=output.final_answer,
            explanation=explanation,
            metadata={
                "item_id": item.id,
                "item_tier": item.tier,
                "correctness": correctness,
                "correctness_rationale": correctness_rationale,
                "hedge": hedge.model_dump(),
                "citation_faithfulness": cit_summary,
                "citation_checks": [c.model_dump() for c in checks],
                "answer_support": support.model_dump(),
            },
        )

    return score


async def _score_correctness(
    item: Item, output: AgentOutput, judge: Judge
) -> tuple[float, str]:
    if item.claim_type == "numeric" and item.numeric_target is not None:
        num = await score_numeric_judge(
            output.final_answer, item.numeric_target, judge
        )
        return num.score, f"verdict={num.verdict}; {num.rationale}"
    if item.accepted_phrasings:
        verbal = await score_verbal(
            item.question, output.final_answer, item.accepted_phrasings, judge
        )
        score_value = {"MATCH": 1.0, "PARTIAL": 0.5, "MISS": 0.0}[verbal.verdict]
        return score_value, f"verdict={verbal.verdict}; {verbal.rationale}"
    return 0.0, "Item has no numeric target and no accepted phrasings."


@task
def claim_recall(
    *,
    base_url: str = "http://localhost:3000",
    content_dir: str | None = None,
    tier: Tier = "smoke",
    include_held_out: bool = False,
    judge_model: str = "opus",
) -> Task:
    """Librarian / claim_recall: specific claim recall.

    Default: tier="smoke" (5 items, ~15s with --max-samples=5).

    Run with:
      inspect eval forethought_bench/librarian/tasks/claim_recall.py \\
        -T base_url=http://localhost:3000 \\
        -T content_dir=$FORETHOUGHT_CONTENT_DIR \\
        --max-samples=5

    Run extended (8 items):
      inspect eval forethought_bench/librarian/tasks/claim_recall.py \\
        -T tier=extended --max-samples=8

    Set FOREBENCH_USE_API=1 to bill against the API key (faster, costs money)
    instead of Claude Code subscription billing.
    """
    resolved = resolve_content_dir(content_dir)
    corpus = Corpus.from_directory(resolved)
    judge = build_judge(judge_model)
    agent = build_agent(base_url)

    items = load_items_for_track(
        "librarian", TrackName.CLAIM_RECALL,
        tier=tier, include_held_out=include_held_out,
    )
    metadata: dict[str, Any] = {
        "mode": "librarian",
        "track": "claim_recall",
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
        scorer=claim_recall_scorer(corpus, judge),
        metadata=metadata,
    )
