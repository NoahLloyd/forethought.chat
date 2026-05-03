"""LLM-as-judge for numeric correctness.

The earlier regex extractor in `numeric_tolerance.py` only fires on digit-bearing
matches, so word-form prose like "eightfold", "a tenfold increase", or
"two-thirds" silently misses. Extending the regex with every word form is a
losing arms race against the agent's stylistic surface area.

This judge instead asks an LLM whether the agent's answer expresses a numeric
value that agrees with the target within tolerance. The judge is given the
target value, the unit, and the tolerance bounds explicitly so its decision is
the same one the regex was trying to make — just with full prose competence.

Three-way verdict:
  CORRECT   - the answer expresses a value that is unambiguously within tolerance
  PARTIAL   - the answer expresses a value that is close but outside tolerance,
              OR the answer hedges in a way that the *band* it gives includes
              the target but the central value is off
  INCORRECT - the answer expresses a value that contradicts the target, or
              expresses no value at all
"""

from __future__ import annotations

import json
import re

from pydantic import BaseModel

from forethought_bench.judges import Judge, JudgeRequest
from forethought_bench.schema import NumericTarget

NUMERIC_JUDGE_SYSTEM = """\
You grade whether an agent's answer expresses a numeric value that matches a
target value within tolerance. The agent answer is prose; the value may be
written as digits ("8x"), words ("eightfold"), a fraction ("two-thirds"), or
a hedged range ("5x to 10x").

You will be given:
  TARGET_VALUE: the canonical numeric value the answer should express
  UNIT:         the unit ("x" for multiplier, "%" for percent, "probability"
                for a [0,1] probability, or "" for bare number)
  TOLERANCE:    a description of how close the answer must be to count

Verdict, on the first line, EXACTLY one of:
  CORRECT   : the answer expresses a value within tolerance of the target
  PARTIAL   : the answer expresses a value that is close-but-outside tolerance,
              OR a hedged range whose central value is off but whose band
              includes the target, OR the answer is otherwise materially right
              but not crisp enough to count as CORRECT
  INCORRECT : the answer contradicts the target, or expresses no number at all

Then 1-2 sentences of rationale that name the value(s) you extracted from the
answer and the comparison you made.

Strictness:
- Word forms count as numeric values: "eightfold" = 8x, "half" = 0.5,
  "two-thirds" = 0.67. Apply naturally.
- Probabilities expressed as percentages convert: 50% = 0.5 when UNIT is
  "probability".
- A range like "between 5x and 10x" is INCORRECT for target 21x and CORRECT
  for target 8x; PARTIAL only when the central value is just outside but
  the band crosses the tolerance.
- If the answer mentions multiple numbers, pick the one the agent presents
  as THE answer to the question, not numbers in surrounding context (years,
  page numbers, citation markers).
- Do not credit a value the agent gives as a contrast or a counterexample.
"""

NUMERIC_JUDGE_USER_TEMPLATE = """\
TARGET_VALUE: {target}
UNIT: {unit}
TOLERANCE: {tolerance}

AGENT ANSWER:
\"\"\"
{answer}
\"\"\"

VERDICT:"""


class NumericJudgeResult(BaseModel):
    verdict: str  # CORRECT | PARTIAL | INCORRECT
    score: float  # 1.0 / 0.5 / 0.0
    rationale: str
    target: float
    unit: str | None
    tolerance: str  # human-readable description, mirrors what the judge saw


def _format_tolerance(target: NumericTarget) -> str:
    rtol = target.tolerance.rtol
    atol = target.tolerance.atol
    parts: list[str] = []
    if rtol > 0:
        parts.append(f"+/- {rtol * 100:.1f}% relative")
    if atol > 0:
        parts.append(f"+/- {atol:g} absolute")
    if not parts:
        return "exact match required"
    return " and ".join(parts) + " (whichever is larger)"


async def score_numeric_judge(
    answer: str,
    target: NumericTarget,
    judge: Judge,
) -> NumericJudgeResult:
    """Grade a numeric claim with an LLM judge.

    Returns a 3-way verdict (CORRECT/PARTIAL/INCORRECT) mapped to 1.0/0.5/0.0.
    Caller composites this into the track's overall score.
    """
    if not answer or not answer.strip():
        return NumericJudgeResult(
            verdict="INCORRECT",
            score=0.0,
            rationale="empty answer",
            target=target.value,
            unit=target.unit,
            tolerance=_format_tolerance(target),
        )

    tolerance_desc = _format_tolerance(target)
    user = NUMERIC_JUDGE_USER_TEMPLATE.format(
        target=_format_target_value(target),
        unit=target.unit or "(bare number)",
        tolerance=tolerance_desc,
        answer=answer,
    )
    resp = await judge.complete(
        JudgeRequest(
            system=NUMERIC_JUDGE_SYSTEM,
            user=user,
            max_tokens=256,
        )
    )
    verdict = _parse_verdict(resp.text)
    return NumericJudgeResult(
        verdict=verdict,
        score={"CORRECT": 1.0, "PARTIAL": 0.5, "INCORRECT": 0.0}[verdict],
        rationale=resp.text.strip(),
        target=target.value,
        unit=target.unit,
        tolerance=tolerance_desc,
    )


def _format_target_value(target: NumericTarget) -> str:
    """Render the target the way a judge can compare against the prose.

    For probabilities, also surface the percent equivalent so the judge does not
    have to convert it itself; this matches how authors typically phrase items.
    """
    v = target.value
    if target.unit == "probability":
        return f"{v} (i.e. {v * 100:g}%)"
    if target.unit == "%":
        return f"{v}%"
    if target.unit in {"x", "fold"}:
        return f"{v}x"
    return f"{v}"


# Verdict must be the first word on the first non-empty line. INCORRECT comes
# first in alternation so "INCORRECT" doesn't get parsed as "CORRECT".
_VERDICT_HEAD_RE = re.compile(r"^\s*(INCORRECT|CORRECT|PARTIAL)\b")


def _parse_verdict(text: str) -> str:
    if not text:
        return "INCORRECT"
    for line in text.splitlines():
        if not line.strip():
            continue
        m = _VERDICT_HEAD_RE.match(line.upper())
        return m.group(1) if m else "INCORRECT"
    return "INCORRECT"


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
