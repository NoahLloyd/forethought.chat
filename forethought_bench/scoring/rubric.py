"""Required-elements rubric scorer.

For Track 3 (argument reconstruction) and partly Track 4 (synthesis):
  Each item declares a list of required_elements - specific claims/premises/
  conclusions that any good answer must include. The judge marks each element
  as present/absent in the agent's answer; the score is the fraction present.
"""

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from forethought_bench.judges import Judge, JudgeRequest

RUBRIC_JUDGE_SYSTEM = """\
You grade an agent's answer against a checklist of REQUIRED ELEMENTS that any
good answer must include. The elements are specific claims, premises, or
conclusions; mark each one PRESENT, MISSING, or PARTIAL.

Return JSON only, no markdown fences:

{
  "results": [
    {"element_index": 0, "verdict": "PRESENT" | "PARTIAL" | "MISSING", "rationale": "<one sentence>"},
    ...
  ]
}

Rules:
- PRESENT: the element is clearly stated or directly entailed in the answer.
- PARTIAL: the answer touches on the element but misses a key detail (a number,
  a name, a specific direction).
- MISSING: not stated and not entailed.
- Do NOT credit the agent for paraphrasing the element; you must check that the
  *substantive content* of the element appears in the answer.
- Verdict on each element is independent.
"""

RUBRIC_JUDGE_USER_TEMPLATE = """\
QUESTION: {question}

REQUIRED ELEMENTS (number each one is the element_index):
{elements_block}

AGENT ANSWER:
\"\"\"
{answer}
\"\"\"

JSON:"""


class ElementResult(BaseModel):
    element_index: int
    element: str
    verdict: str  # PRESENT | PARTIAL | MISSING
    rationale: str = ""


class RubricResult(BaseModel):
    elements: list[ElementResult] = Field(default_factory=list)
    fraction_present: float = 0.0
    fraction_at_least_partial: float = 0.0
    n_total: int = 0


async def score_required_elements(
    question: str,
    answer: str,
    required_elements: list[str],
    judge: Judge,
) -> RubricResult:
    if not required_elements:
        return RubricResult()

    elements_block = "\n".join(
        f"  [{i}] {e}" for i, e in enumerate(required_elements)
    )
    resp = await judge.complete(
        JudgeRequest(
            system=RUBRIC_JUDGE_SYSTEM,
            user=RUBRIC_JUDGE_USER_TEMPLATE.format(
                question=question, elements_block=elements_block, answer=answer
            ),
            max_tokens=1024,
        )
    )
    parsed = _parse_json_loose(resp.text) or {}
    raw = parsed.get("results", []) or []

    by_index: dict[int, ElementResult] = {}
    for r in raw:
        try:
            idx = int(r.get("element_index", -1))
        except (TypeError, ValueError):
            continue
        if not (0 <= idx < len(required_elements)):
            continue
        verdict = str(r.get("verdict", "MISSING")).upper().strip()
        if verdict not in {"PRESENT", "PARTIAL", "MISSING"}:
            verdict = "MISSING"
        by_index[idx] = ElementResult(
            element_index=idx,
            element=required_elements[idx],
            verdict=verdict,
            rationale=str(r.get("rationale", ""))[:600],
        )

    elements: list[ElementResult] = []
    for i, e in enumerate(required_elements):
        elements.append(
            by_index.get(
                i,
                ElementResult(
                    element_index=i,
                    element=e,
                    verdict="MISSING",
                    rationale="(not graded)",
                ),
            )
        )

    n = len(elements)
    n_present = sum(1 for r in elements if r.verdict == "PRESENT")
    n_partial = sum(1 for r in elements if r.verdict == "PARTIAL")
    return RubricResult(
        elements=elements,
        fraction_present=n_present / n if n else 0.0,
        fraction_at_least_partial=(n_present + 0.5 * n_partial) / n if n else 0.0,
        n_total=n,
    )


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
