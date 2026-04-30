"""Open-domain research rubric for Track 6.

The agent answers a Forethought-adjacent macrostrategy question that
Forethought hasn't directly answered. We grade on four axes:
  - comprehensiveness  : breadth of relevant considerations covered
  - depth              : substantive engagement vs. surface gloss
  - instruction_following : does it directly address what was asked
  - readability        : clarity, structure, ease of following

Each axis is graded 1-5 by an LLM judge. Composite is the mean / 5.
Citation faithfulness is scored separately by the citation pipeline; even
on open-domain questions, any citation the agent makes still has to verify.
"""

from __future__ import annotations

import json
import re

from pydantic import BaseModel

from forethought_bench.judges import Judge, JudgeRequest

OPEN_RESEARCH_JUDGE_SYSTEM = """\
You grade an agent's open-domain research answer on a macrostrategy question
across four axes. Each axis is scored 1 (poor) - 5 (excellent).

  - comprehensiveness     : breadth of relevant considerations addressed
  - depth                 : substantive engagement vs. surface gloss
  - instruction_following : directness in answering what was asked
  - readability           : clarity, structure, ease of following

Return JSON only:

{
  "scores": {
    "comprehensiveness": <1-5>,
    "depth": <1-5>,
    "instruction_following": <1-5>,
    "readability": <1-5>
  },
  "rationale": "<two or three sentences explaining the axes' lows and highs>"
}

Be strict: 5 means publishable in a research blog, 3 means an OK first draft,
1 means hand-waving or off-topic.
"""

OPEN_RESEARCH_USER_TEMPLATE = """\
QUESTION: {question}

AGENT ANSWER:
\"\"\"
{answer}
\"\"\"

JSON:"""


class OpenResearchResult(BaseModel):
    comprehensiveness: int  # 1-5
    depth: int
    instruction_following: int
    readability: int
    composite: float  # mean / 5, in [0, 1]
    rationale: str


async def score_open_research(
    question: str, answer: str, judge: Judge
) -> OpenResearchResult:
    resp = await judge.complete(
        JudgeRequest(
            system=OPEN_RESEARCH_JUDGE_SYSTEM,
            user=OPEN_RESEARCH_USER_TEMPLATE.format(question=question, answer=answer),
            max_tokens=600,
        )
    )
    data = _parse_json_loose(resp.text) or {}
    scores = data.get("scores", {}) or {}

    def clamp(v: object) -> int:
        try:
            n = int(round(float(v)))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            n = 1
        return max(1, min(5, n))

    comp = clamp(scores.get("comprehensiveness", 1))
    depth = clamp(scores.get("depth", 1))
    instr = clamp(scores.get("instruction_following", 1))
    read = clamp(scores.get("readability", 1))
    composite = (comp + depth + instr + read) / 20.0
    return OpenResearchResult(
        comprehensiveness=comp,
        depth=depth,
        instruction_following=instr,
        readability=read,
        composite=composite,
        rationale=str(data.get("rationale", ""))[:600],
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
