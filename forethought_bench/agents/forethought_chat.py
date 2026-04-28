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

Citation extraction is deterministic and heuristic, not LLM-based:
- For each [N] marker in the prose, the surrounding sentence becomes the
  parsed_claim and the source.snippet (the chunk the agent actually saw)
  becomes Citation.passage.
- This fixes the "passage-threading" bug where the previous LLM extractor
  produced Citation.passage = None and the citation-faithfulness pipeline
  fell back to the head of the cited document, mis-grading correct citations
  as real_but_unsupportive.
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
        timeout: float = 180.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.name = f"forethought-chat:{self.base_url}"
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
        citations = extract_citations_from_markers(prose, sources)

        return AgentOutput(
            final_answer=prose,
            citations=citations,
            confidence=None,
            search_queries=search_queries,
            retrieved_passages=retrieved_passages,
            raw=prose,
        )


# Citation marker pattern: [3] or [1, 6] or [12,3].
_MARKER_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def extract_citations_from_markers(
    prose: str, sources: list[dict[str, Any]]
) -> list[Citation]:
    """Parse [N] markers from prose and produce Citations using the snippets
    the chat app already retrieved.

    Each Citation gets:
      url, title : from sources[N]
      passage    : sources[N].snippet (the chunk the agent actually saw)
      supports   : the sentence containing the [N] marker, with [N] tokens stripped

    A given (claim, marker) pair appears once. Markers without a matching
    source are skipped (this would only happen if the chat app emitted [N]
    in prose without ever sending sources, which the app's code doesn't do).
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
                    passage=sd.get("snippet"),
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
