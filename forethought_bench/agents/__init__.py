"""Agent adapters.

An Agent answers a question and returns a structured AgentOutput. The
benchmark grades AgentOutput, so any agent that can be wrapped to emit
this schema can be evaluated.

V1 ships:
- ForethoughtChatAgent: HTTP adapter for the forethoughtchat /api/chat SSE.
- MockAgent: deterministic stub for tests.
"""

from forethought_bench.agents.base import Agent
from forethought_bench.agents.forethought_chat import ForethoughtChatAgent
from forethought_bench.agents.mock import MockAgent

__all__ = ["Agent", "ForethoughtChatAgent", "MockAgent"]
