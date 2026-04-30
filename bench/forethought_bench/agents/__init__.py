"""Agent adapters.

An Agent answers a question and returns a structured AgentOutput. The
benchmark grades AgentOutput, so any agent that can be wrapped to emit
this schema can be evaluated.

Adapters:
- ClaudeCliAgent      : subscription-billed, spawns `claude -p` with the
                        same persona + retrieval as the chat app. Default
                        for FOREBENCH_AGENT=cli (and the bench default).
- ForethoughtChatAgent: HTTP adapter for the forethoughtchat /api/chat
                        SSE. Bills against ANTHROPIC_API_KEY. Use only
                        when you specifically want to grade the deployed
                        HTTP behavior (FOREBENCH_AGENT=http).
- MockAgent           : deterministic stub for tests.
"""

from forethought_bench.agents.base import Agent
from forethought_bench.agents.claude_cli import ClaudeCliAgent
from forethought_bench.agents.forethought_chat import ForethoughtChatAgent
from forethought_bench.agents.mock import MockAgent

__all__ = ["Agent", "ClaudeCliAgent", "ForethoughtChatAgent", "MockAgent"]
