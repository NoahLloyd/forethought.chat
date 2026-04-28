"""Track 4: Cross-Corpus Synthesis (STUB).

Per the design doc:
  Integrate across multiple Forethought papers; flag conflicts, view evolution,
  and disagreement between authors where present. Rubric LLM judge. ~25 items.

Implementation notes:
  - item.expected_citations should list multiple URLs (synthesis requires >=2).
  - Score that the agent's citations span the expected set (recall@k of urls).
  - Rubric judge for synthesis quality (does the answer integrate, not just
    list per-source quotes?).
"""

from __future__ import annotations

from inspect_ai import Task, task
from inspect_ai.scorer import Score, Target, mean, scorer
from inspect_ai.solver import TaskState

from forethought_bench.agents import ForethoughtChatAgent
from forethought_bench.schema import TrackName
from forethought_bench.tasks._common import (
    agent_solver,
    items_to_dataset,
    load_items_for_track,
)


@scorer(metrics=[mean()])
def synthesis_scorer():
    async def score(state: TaskState, target: Target) -> Score:
        return Score(value=0.0, explanation="synthesis scorer not implemented")

    return score


@task
def synthesis(*, base_url: str = "http://localhost:3000") -> Task:
    items = load_items_for_track(TrackName.SYNTHESIS)
    return Task(
        dataset=items_to_dataset(items),
        solver=agent_solver(ForethoughtChatAgent(base_url=base_url)),
        scorer=synthesis_scorer(),
        metadata={"track": "synthesis", "status": "stub"},
    )
