"""Track 1: Definition & Framework Recall (STUB).

Per the design doc:
  Does the agent know Forethought's specific concepts (viatopia, ASARA, AI
  character, three IE types, lock-in mechanisms)? Short answer, multi-reference
  LLM judge. ~30 items.

Implementation notes:
  - Reuse score_verbal from scoring.verbal_match with item.accepted_phrasings.
  - Each item should have 2-3 accepted phrasings (single-reference grading
    breaks on paraphrase).
  - Also run citation faithfulness; an agent that defines "viatopia" correctly
    but fabricates a citation should still fail.
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
def definitions_scorer():
    async def score(state: TaskState, target: Target) -> Score:
        return Score(
            value=0.0,
            explanation="definitions scorer not implemented; see TODO in tasks/definitions.py",
        )

    return score


@task
def definitions(*, base_url: str = "http://localhost:3000") -> Task:
    items = load_items_for_track(TrackName.DEFINITIONS)
    return Task(
        dataset=items_to_dataset(items),
        solver=agent_solver(ForethoughtChatAgent(base_url=base_url)),
        scorer=definitions_scorer(),
        metadata={"track": "definitions", "status": "stub"},
    )
