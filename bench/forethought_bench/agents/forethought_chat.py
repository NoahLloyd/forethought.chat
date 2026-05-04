"""HTTP adapter for the forethoughtchat /api/chat SSE endpoint.

Wire format (verified against the chat app's route handler):
  event: sources    data: {"sources": SourceCard[]}
  event: text       data: {"delta": "..."}
  event: tool_call  data: {"name": "search", "query": "..."}
  event: done       data: {"stopReason", "iterations", "usage"}
  event: error      data: {"message": "..."}

When the chat app's iteration cap is hit, it emits an `error` event AFTER any
partial prose has streamed. We keep the partial answer rather than raising,
so the benchmark can still grade what the agent did manage to produce. The
truncation is recorded in AgentOutput.raw and surfaced via .metadata.
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from forethought_bench.agents.base import Agent
from forethought_bench.schema import AgentOutput, Citation, RetrievedPassage

DEFAULT_BASE_URL = "http://localhost:3000"


class ForethoughtChatAgent(Agent):
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        timeout: float = 240.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.name = f"forethought-chat:{self.base_url}"
        self._timeout = timeout

    async def answer(self, question: str) -> AgentOutput:
        sources: list[dict[str, Any]] = []
        text_parts: list[str] = []
        search_queries: list[str] = []
        truncation: str | None = None

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
                        # Don't raise - keep whatever partial prose has streamed.
                        # The chat app emits this when it hits its iteration cap.
                        truncation = str(data.get("message", "unknown error"))
                        break

        prose = "".join(text_parts)
        retrieved_passages = [
            RetrievedPassage(
                url=s.get("url"),
                title=s.get("title"),
                text=s.get("snippet", ""),
            )
            for s in sources
        ]
        citations = extract_citations_from_markers(prose, sources)

        raw = prose
        if truncation:
            raw = (raw + f"\n\n[forethought-bench note: agent run truncated - {truncation}]").strip()

        return AgentOutput(
            final_answer=prose,
            citations=citations,
            confidence=None,
            search_queries=search_queries,
            retrieved_passages=retrieved_passages,
            raw=raw,
        )


# Citation marker pattern: [3] or [1, 6] or [12,3].
_MARKER_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def extract_citations_from_markers(
    prose: str, sources: list[dict[str, Any]]
) -> list[Citation]:
    """Parse [N] markers from prose and produce Citations using the chunk
    text the chat app already retrieved.

    Citation.passage is set to the FULL chunk text (not the truncated
    snippet) when available, so the citation-faithfulness judge grades
    against the same evidence the agent actually saw. Older source records
    that only have `snippet` fall back to that.
    """
    by_marker: dict[int, dict[str, Any]] = {}
    for s in sources:
        marker = s.get("marker")
        try:
            by_marker[int(marker)] = s  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue

    citations: list[Citation] = []
    seen: set[tuple[str, int]] = set()
    for sentence in _split_sentences(prose):
        markers = _markers_in(sentence)
        if not markers:
            continue
        claim = _strip_markers(sentence).strip()
        if not claim:
            continue
        for n in markers:
            sd = by_marker.get(n)
            if sd is None:
                continue
            key = (claim, n)
            if key in seen:
                continue
            seen.add(key)
            citations.append(
                Citation(
                    url=sd.get("url"),
                    title=sd.get("title"),
                    passage=sd.get("chunk_text") or sd.get("snippet"),
                    supports=claim,
                )
            )
    return citations


def _split_sentences(text: str) -> list[str]:
    return [s for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]


def _markers_in(text: str) -> list[int]:
    out: list[int] = []
    for m in _MARKER_RE.finditer(text):
        for n_str in re.findall(r"\d+", m.group(1)):
            out.append(int(n_str))
    return out


def _strip_markers(text: str) -> str:
    return _MARKER_RE.sub("", text)


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
