"""Agent abstract base."""

from __future__ import annotations

from abc import ABC, abstractmethod

from forethought_bench.schema import AgentOutput


class Agent(ABC):
    """All agents under test expose `answer(question) -> AgentOutput`.

    Implementations may use post-hoc extraction (LLM call) to map prose to
    AgentOutput; a future production agent should emit the schema natively
    so trace-based grading isn't hand-wavy.
    """

    name: str

    @abstractmethod
    async def answer(self, question: str) -> AgentOutput:
        raise NotImplementedError
