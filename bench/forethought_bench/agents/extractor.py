"""Post-hoc extractor: prose + numbered sources -> AgentOutput.

For agents that emit prose with `[N]` citation markers (the forethoughtchat
shape), this maps each marker to a Citation whose `supports` field is the
specific claim the agent attached the marker to.

Production agents should emit AgentOutput natively to avoid this round-trip.
"""

from __future__ import annotations

import json
import re
from typing import Any

from forethought_bench.judges import Judge, JudgeRequest
from forethought_bench.schema import AgentOutput, Citation

EXTRACTOR_SYSTEM = """\
You convert a chat agent's prose response into structured JSON for benchmark
grading. The agent answers questions about Forethought Research's papers and
cites sources inline as bracketed numerals like [1], [2].

INPUT
- PROSE: the agent's answer.
- SOURCES: a numbered list mapping each marker to a URL and title.

OUTPUT (JSON only, no markdown fences)
{
  "final_answer": <string, the agent's answer with [N] markers preserved>,
  "citations": [
    {
      "url": <string, URL of the cited source>,
      "title": <string, title of the cited source>,
      "passage": <string or null; if the agent quoted text in the answer attributed to [N], copy that quote verbatim, else null>,
      "supports": <string, a one-sentence summary of the SPECIFIC claim this marker supports - not a paraphrase of the whole answer>
    }
  ],
  "confidence": <number in [0,1] if the agent expressed a probability about its answer, else null>,
  "search_queries": <list of strings, any tool-search queries the agent reported, else []>
}

RULES
- Emit one citation entry for each [N] marker that resolves to a source. If a marker repeats, emit it once per distinct claim it supports.
- "supports" must be the smallest claim in the answer that the citation backs. Do not paraphrase the whole answer.
- Do not invent citations the agent didn't make.
- If a marker has no matching source, omit it.
"""


async def extract_agent_output(
    prose: str,
    sources: list[dict[str, Any]],
    judge: Judge,
    *,
    search_queries: list[str] | None = None,
) -> AgentOutput:
    """Run the extractor judge and return AgentOutput.

    Falls back to a marker-only Citation list if the judge returns
    unparseable JSON; better to grade with weak citations than to lose the
    eval sample entirely.
    """
    sources_block = _format_sources(sources)
    user = (
        f'PROSE:\n"""\n{prose}\n"""\n\n'
        f"SOURCES:\n{sources_block}\n\n"
        f"JSON:"
    )
    resp = await judge.complete(
        JudgeRequest(system=EXTRACTOR_SYSTEM, user=user, max_tokens=2048)
    )
    data = _parse_json_loose(resp.text)
    if data is None:
        return _fallback(prose, sources, search_queries or [])

    citations: list[Citation] = []
    for c in data.get("citations", []) or []:
        try:
            citations.append(Citation.model_validate(c))
        except Exception:
            continue

    return AgentOutput(
        final_answer=data.get("final_answer") or prose,
        citations=citations,
        confidence=_coerce_confidence(data.get("confidence")),
        search_queries=list(data.get("search_queries", []) or []) or (search_queries or []),
        raw=prose,
    )


def _format_sources(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return "(none)"
    lines: list[str] = []
    for s in sources:
        marker = s.get("marker") or s.get("index")
        url = s.get("url", "")
        title = s.get("title", "")
        lines.append(f"[{marker}] {title} - {url}")
    return "\n".join(lines)


def _parse_json_loose(text: str) -> dict[str, Any] | None:
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", raw, flags=re.IGNORECASE)
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to recover the first JSON object in the response.
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
        return None


def _coerce_confidence(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if 0.0 <= f <= 1.0:
        return f
    return None


def _fallback(
    prose: str, sources: list[dict[str, Any]], search_queries: list[str]
) -> AgentOutput:
    """Marker-only fallback when the extractor JSON fails to parse.

    Emits a Citation per [N] marker found in prose with url/title from sources
    but no `supports` claim attached. Faithfulness will grade these as PARTIAL
    (existence verified, support not graded).
    """
    by_marker: dict[int, dict[str, Any]] = {
        int(s["marker"]): s for s in sources if "marker" in s
    }
    citations: list[Citation] = []
    seen: set[int] = set()
    for m in re.finditer(r"\[(\d+)\]", prose):
        n = int(m.group(1))
        if n in seen or n not in by_marker:
            continue
        seen.add(n)
        s = by_marker[n]
        citations.append(
            Citation(
                url=s.get("url"),
                title=s.get("title"),
                passage=None,
                supports=None,
            )
        )
    return AgentOutput(
        final_answer=prose,
        citations=citations,
        confidence=None,
        search_queries=search_queries,
        raw=prose,
    )
