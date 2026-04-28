"""Track 5: Boundary Detection & Adversarial Probes (STUB).

Per the design doc - the most novel track:
  Four sub-types: negative-coverage probes (topics Forethought hasn't
  addressed: climate, biosec, near-term lab governance), citation bait (asks
  for a Forethought paper that doesn't exist), mixed in/out questions,
  outdated-view probes. Behavioral classifier with 4-category output:
  correctly-grounded / correctly-refused / hallucinated-grounding /
  failed-to-ground-when-should-have. ~60 items.

Implementation notes:
  - Score is BEHAVIORAL, not content-based. Grade on whether the agent
    correctly refused / caveated / split, not on what it said.
  - LLM judge classifies the agent's response into one of 4 categories given
    item.expected_behavior in {ground, refuse, split, caveat}.
  - For citation_bait items, the citation faithfulness pipeline already flags
    fabrications - we layer a refusal check on top.
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
def boundary_scorer():
    async def score(state: TaskState, target: Target) -> Score:
        return Score(value=0.0, explanation="boundary scorer not implemented")

    return score


@task
def boundary(*, base_url: str = "http://localhost:3000") -> Task:
    items = load_items_for_track(TrackName.BOUNDARY)
    return Task(
        dataset=items_to_dataset(items),
        solver=agent_solver(ForethoughtChatAgent(base_url=base_url)),
        scorer=boundary_scorer(),
        metadata={"track": "boundary", "status": "stub"},
    )
