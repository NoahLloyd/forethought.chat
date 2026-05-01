"""Synthesis scorers for Track 4.

Two pieces:
  1. citation_recall - fraction of expected URLs the agent actually cited.
  2. integration_quality - LLM rubric: does the answer integrate (compare,
     contrast, combine) or merely list per-source quotes?

Both ride on top of required_elements scoring, which is shared with Track 3.
"""

from __future__ import annotations

import json
import re
from urllib.parse import urlparse

from pydantic import BaseModel

from forethought_bench.judges import Judge, JudgeRequest
from forethought_bench.schema import AgentOutput

INTEGRATION_JUDGE_SYSTEM = """\
You grade whether an agent's answer INTEGRATES across multiple sources or
merely LISTS per-source content. Integration means: compares, contrasts,
combines, or uses both sources jointly to derive a conclusion that neither
source provides alone. Listing means: source A says X, source B says Y, with
no synthesis between them.

Return JSON only:

{
  "verdict": "INTEGRATED" | "PARTIAL" | "LIST_ONLY",
  "rationale": "<one or two sentences>"
}
"""

INTEGRATION_JUDGE_USER_TEMPLATE = """\
QUESTION: {question}

EXPECTED RELATIONSHIP BETWEEN SOURCES: {relationship}

AGENT ANSWER:
\"\"\"
{answer}
\"\"\"

JSON:"""


class CitationRecall(BaseModel):
    expected_urls: list[str]
    cited_urls: list[str]
    matched: list[str]
    missing: list[str]
    recall: float  # |matched| / |expected_urls|


class IntegrationResult(BaseModel):
    verdict: str  # INTEGRATED | PARTIAL | LIST_ONLY
    rationale: str
    score: float  # 1.0 / 0.5 / 0.0


def score_citation_recall(
    output: AgentOutput, expected_urls: list[str]
) -> CitationRecall:
    if not expected_urls:
        return CitationRecall(
            expected_urls=[], cited_urls=[], matched=[], missing=[], recall=1.0
        )
    cited = [c.url for c in output.citations if c.url]
    cited_canon = {_canon(u) for u in cited}
    expected_canon = [_canon(u) for u in expected_urls]
    matched = [u for u, c in zip(expected_urls, expected_canon) if c in cited_canon]
    missing = [u for u in expected_urls if u not in matched]
    return CitationRecall(
        expected_urls=list(expected_urls),
        cited_urls=cited,
        matched=matched,
        missing=missing,
        recall=len(matched) / len(expected_urls),
    )


async def score_integration(
    question: str, answer: str, relationship: str, judge: Judge
) -> IntegrationResult:
    resp = await judge.complete(
        JudgeRequest(
            system=INTEGRATION_JUDGE_SYSTEM,
            user=INTEGRATION_JUDGE_USER_TEMPLATE.format(
                question=question, relationship=relationship, answer=answer
            ),
            max_tokens=400,
        )
    )
    data = _parse_json_loose(resp.text) or {}
    verdict = str(data.get("verdict", "LIST_ONLY")).upper().strip()
    if verdict not in {"INTEGRATED", "PARTIAL", "LIST_ONLY"}:
        verdict = "LIST_ONLY"
    score = {"INTEGRATED": 1.0, "PARTIAL": 0.5, "LIST_ONLY": 0.0}[verdict]
    return IntegrationResult(
        verdict=verdict,
        rationale=str(data.get("rationale", ""))[:400],
        score=score,
    )


def _canon(url: str) -> str:
    p = urlparse(url.strip())
    path = p.path.rstrip("/").lower()
    return f"{p.netloc.lower()}{path}"


def _parse_json_loose(text: str) -> dict | None:
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```\s*$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", s, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
        return None
