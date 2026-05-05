"""Required-elements rubric scorer.

For Track 3 (argument reconstruction) and partly Track 4 (synthesis):
  Each item declares a list of required_elements - specific claims/premises/
  conclusions that any good answer must include. The judge marks each element
  as present/absent in the agent's answer; the score is the fraction present.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections import Counter

from pydantic import BaseModel, Field

from forethought_bench.judges import Judge, JudgeRequest

_VERDICT_SCORES: dict[str, float] = {"PRESENT": 1.0, "PARTIAL": 0.5, "MISSING": 0.0}

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
    *,
    passes: int = 1,
) -> RubricResult:
    """Grade an answer against a checklist of required elements.

    With ``passes > 1`` the judge is called N times in parallel and the
    per-element verdict is the majority across passes (tie-break by mean
    verdict score). Iteration/09 documented same-prose verdict swings
    (synthesis_002 drifted 3/5 PRESENT → 5/5 MISSING run-to-run); the CLI
    judge has no exposed temperature control, so per-call noise is real
    even at request-side temperature=0. Median-of-N reduces the
    track-level σ contribution from those swings without changing mean
    behavior on items where the judge is consistent.
    """
    if not required_elements:
        return RubricResult()
    if passes < 1:
        passes = 1

    elements_block = "\n".join(
        f"  [{i}] {e}" for i, e in enumerate(required_elements)
    )
    request = JudgeRequest(
        system=RUBRIC_JUDGE_SYSTEM,
        user=RUBRIC_JUDGE_USER_TEMPLATE.format(
            question=question, elements_block=elements_block, answer=answer
        ),
        max_tokens=1024,
    )

    if passes == 1:
        resps = [await judge.complete(request)]
    else:
        resps = await asyncio.gather(
            *(judge.complete(request) for _ in range(passes))
        )

    per_pass = [_parse_pass(resp.text, required_elements) for resp in resps]

    elements = _merge_pass_verdicts(per_pass, required_elements)
    n = len(elements)
    n_present = sum(1 for r in elements if r.verdict == "PRESENT")
    n_partial = sum(1 for r in elements if r.verdict == "PARTIAL")
    return RubricResult(
        elements=elements,
        fraction_present=n_present / n if n else 0.0,
        fraction_at_least_partial=(n_present + 0.5 * n_partial) / n if n else 0.0,
        n_total=n,
    )


def _parse_pass(
    response_text: str, required_elements: list[str]
) -> dict[int, ElementResult]:
    """Parse one judge response into a per-element-index map.

    Missing or invalid entries fall back to MISSING with rationale "(not
    graded)" so downstream merging always has a value per index.
    """
    parsed = _parse_json_loose(response_text) or {}
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
        if verdict not in _VERDICT_SCORES:
            verdict = "MISSING"
        by_index[idx] = ElementResult(
            element_index=idx,
            element=required_elements[idx],
            verdict=verdict,
            rationale=str(r.get("rationale", ""))[:600],
        )
    for i, e in enumerate(required_elements):
        by_index.setdefault(
            i,
            ElementResult(
                element_index=i,
                element=e,
                verdict="MISSING",
                rationale="(not graded)",
            ),
        )
    return by_index


def _merge_pass_verdicts(
    per_pass: list[dict[int, ElementResult]],
    required_elements: list[str],
) -> list[ElementResult]:
    """Merge N per-element verdict maps with majority-vote + score tie-break.

    Ties (e.g. PRESENT/PARTIAL/MISSING one each) resolve to the verdict
    closest to the mean score: 0.0/0.5/1.0 → PARTIAL etc. Rationale on the
    merged element is borrowed from the first pass that voted with the
    winning verdict, so callers see real judge prose rather than a
    "(merged)" placeholder.
    """
    out: list[ElementResult] = []
    for i, e in enumerate(required_elements):
        verdicts = [p[i].verdict for p in per_pass]
        winner = _majority_verdict(verdicts)
        rationale = next(
            (p[i].rationale for p in per_pass if p[i].verdict == winner),
            per_pass[0][i].rationale,
        )
        out.append(
            ElementResult(
                element_index=i,
                element=e,
                verdict=winner,
                rationale=rationale,
            )
        )
    return out


def _majority_verdict(verdicts: list[str]) -> str:
    """Most common verdict; tie-break by mean score → nearest verdict."""
    if not verdicts:
        return "MISSING"
    counts = Counter(verdicts)
    top_count = counts.most_common(1)[0][1]
    leaders = [v for v, c in counts.items() if c == top_count]
    if len(leaders) == 1:
        return leaders[0]
    mean_score = sum(_VERDICT_SCORES[v] for v in verdicts) / len(verdicts)
    return min(
        _VERDICT_SCORES.keys(),
        key=lambda v: abs(_VERDICT_SCORES[v] - mean_score),
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
