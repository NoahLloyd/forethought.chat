"""Track 6: Open-Domain Research (STUB).

Per the design doc:
  Forethought-adjacent macrostrategy questions Forethought hasn't directly
  answered. Rubric grading (comprehensiveness, depth, instruction-following,
  readability) + citation verification + pairwise vs. baseline. ~20-30 items.

Implementation notes:
  - Rubric judge across the 4 axes; aggregate to a single score.
  - Citation verification still applies (open-domain answers should cite real
    sources, even if non-Forethought - the corpus check expands accordingly).
  - Pairwise comparison vs. baseline must be length-controlled (AlpacaEval
    LC-WR style) - judges have systematic length bias.
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
def open_research_scorer():
    async def score(state: TaskState, target: Target) -> Score:
        return Score(value=0.0, explanation="open_research scorer not implemented")

    return score


@task
def open_research(*, base_url: str = "http://localhost:3000") -> Task:
    items = load_items_for_track(TrackName.OPEN_RESEARCH)
    return Task(
        dataset=items_to_dataset(items),
        solver=agent_solver(ForethoughtChatAgent(base_url=base_url)),
        scorer=open_research_scorer(),
        metadata={"track": "open_research", "status": "stub"},
    )
