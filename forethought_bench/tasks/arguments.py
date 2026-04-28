"""Track 3: Argument Reconstruction (STUB).

Per the design doc:
  Reproduce the premise -> conclusion structure of named arguments
  (defense-favoured coordination, AI-enabled coups as distinct threat,
  three-mechanism lock-in). Rubric LLM judge with required-elements list.
  ~30 items.

Implementation notes:
  - Item.required_elements is the rubric checklist.
  - LLM judge returns per-element verdict (covered / missing / wrong).
  - Score = fraction of required_elements covered, optionally weighted.
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
def arguments_scorer():
    async def score(state: TaskState, target: Target) -> Score:
        return Score(value=0.0, explanation="arguments scorer not implemented")

    return score


@task
def arguments(*, base_url: str = "http://localhost:3000") -> Task:
    items = load_items_for_track(TrackName.ARGUMENTS)
    return Task(
        dataset=items_to_dataset(items),
        solver=agent_solver(ForethoughtChatAgent(base_url=base_url)),
        scorer=arguments_scorer(),
        metadata={"track": "arguments", "status": "stub"},
    )
