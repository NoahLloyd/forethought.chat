"""HTTP adapter for the forethoughtchat /api/chat SSE endpoint.

Wire format (verified against the chat app's route handler):
  event: sources    data: {"sources": SourceCard[]}
  event: text       data: {"delta": "..."}
  event: tool_call  data: {"name": "search", "query": "..."}
  event: done       data: {"stopReason", "iterations", "usage"}
  event: error      data: {"message": "..."}

SourceCard fields: marker, url, title, category, authors, publishedAt,
section, snippet. Markers are stable across the request, so [N] in the
prose answer maps directly to source.marker == N.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from forethought_bench._versions import EXTRACTOR
from forethought_bench.agents.base import Agent
from forethought_bench.agents.extractor import extract_agent_output
from forethought_bench.judges import Judge
from forethought_bench.judges.claude import ClaudeJudge
from forethought_bench.schema import AgentOutput, RetrievedPassage

DEFAULT_BASE_URL = "http://localhost:3000"


class ForethoughtChatAgent(Agent):
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        extractor_judge: Judge | None = None,
        timeout: float = 180.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.name = f"forethought-chat:{self.base_url}"
        self._extractor_judge = extractor_judge or ClaudeJudge(model=EXTRACTOR)
        self._timeout = timeout

    async def answer(self, question: str) -> AgentOutput:
        sources: list[dict[str, Any]] = []
        text_parts: list[str] = []
        search_queries: list[str] = []

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={"messages": [{"role": "user", "content": question}]},
                headers={"accept": "text/event-stream"},
            ) as response:
                response.raise_for_status()
                async for event_name, data in _iter_sse(response):
                    if event_name == "sources":
                        sources = list(data.get("sources", []))
                    elif event_name == "text":
                        delta = data.get("delta", "")
                        if delta:
                            text_parts.append(delta)
                    elif event_name == "tool_call":
                        if data.get("name") == "search":
                            q = data.get("query", "")
                            if q:
                                search_queries.append(q)
                    elif event_name == "done":
                        break
                    elif event_name == "error":
                        raise RuntimeError(
                            f"forethought-chat error: {data.get('message')!r}"
                        )

        prose = "".join(text_parts)
        retrieved_passages = [
            RetrievedPassage(
                url=s.get("url"),
                title=s.get("title"),
                text=s.get("snippet", ""),
            )
            for s in sources
        ]

        extracted = await extract_agent_output(
            prose=prose,
            sources=sources,
            judge=self._extractor_judge,
            search_queries=search_queries,
        )
        return extracted.model_copy(
            update={"retrieved_passages": retrieved_passages, "raw": prose}
        )


async def _iter_sse(response: httpx.Response) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Parse a server-sent events stream from an httpx streaming response."""
    event = "message"
    data_lines: list[str] = []
    async for line in response.aiter_lines():
        if line == "":
            if data_lines:
                payload = "\n".join(data_lines)
                try:
                    parsed = json.loads(payload)
                except json.JSONDecodeError:
                    parsed = {"data": payload}
                yield event, parsed
            event = "message"
            data_lines = []
            continue
        if line.startswith("event:"):
            event = line[len("event:") :].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:") :].strip())
