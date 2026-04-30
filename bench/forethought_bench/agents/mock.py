"""Deterministic mock agent for testing scorers without burning tokens."""

from __future__ import annotations

from collections.abc import Callable

from forethought_bench.agents.base import Agent
from forethought_bench.schema import AgentOutput


class MockAgent(Agent):
    """Returns a fixed AgentOutput, or one produced by a function of the question."""

    def __init__(
        self,
        responder: AgentOutput | Callable[[str], AgentOutput],
        name: str = "mock",
    ) -> None:
        self._responder = responder
        self.name = name

    async def answer(self, question: str) -> AgentOutput:
        if callable(self._responder):
            return self._responder(question)
        return self._responder
