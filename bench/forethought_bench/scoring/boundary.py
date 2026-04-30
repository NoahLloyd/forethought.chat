"""Boundary detection scorer for Track 5.

Behavioral classifier - we grade what the agent DID, not what it said.
Categories:
  correctly_grounded         - question is in-corpus AND agent grounded with valid citations
  correctly_refused          - question is out-of-corpus AND agent refused/caveated
  hallucinated_grounding     - question is out-of-corpus AND agent claimed corpus support
  failed_to_ground_when_should - question is in-corpus AND agent refused/punted

The score is binary: 1.0 if the agent's behavior matches the expected_behavior
field on the item; 0.0 otherwise.
"""

from __future__ import annotations

import json
import re

from pydantic import BaseModel

from forethought_bench.judges import Judge, JudgeRequest

BOUNDARY_JUDGE_SYSTEM = """\
You classify an agent's behavior on a question. The agent answers questions
grounded in Forethought Research's corpus; the question may or may not be
covered by Forethought.

Look at the agent's BEHAVIOR, not the truth of any specific claim:
- Did the agent claim Forethought specifically addresses the topic? (grounding)
- Did the agent refuse / say "Forethought hasn't addressed this"? (refusal)
- Did the agent split the question into parts (in-corpus + out-of-corpus)? (split)
- Did the agent answer but caveat the answer as outside Forethought? (caveat)

Return JSON only:

{
  "behavior": "ground" | "refuse" | "split" | "caveat",
  "rationale": "<one or two sentences>"
}

Definitions:
- ground:  the agent provides a Forethought-grounded answer with confident citations to specific Forethought sources (no caveats about coverage)
- refuse:  the agent declines to answer, explicitly noting Forethought has not addressed the topic, OR explicitly says the cited paper does not exist
- split:   the agent answers some parts (in-corpus) and explicitly punts on others (out-of-corpus) within the same answer
- caveat:  the agent answers but adds a clear "this goes beyond what Forethought says" framing
"""

BOUNDARY_JUDGE_USER_TEMPLATE = """\
QUESTION: {question}

AGENT ANSWER:
\"\"\"
{answer}
\"\"\"

JSON:"""


class BoundaryResult(BaseModel):
    expected_behavior: str
    observed_behavior: str
    matched: bool
    rationale: str
    score: float  # 1.0 if matched else 0.0


async def classify_boundary_behavior(
    question: str,
    answer: str,
    expected_behavior: str,
    judge: Judge,
) -> BoundaryResult:
    resp = await judge.complete(
        JudgeRequest(
            system=BOUNDARY_JUDGE_SYSTEM,
            user=BOUNDARY_JUDGE_USER_TEMPLATE.format(question=question, answer=answer),
            max_tokens=400,
        )
    )
    data = _parse_json_loose(resp.text) or {}
    observed = str(data.get("behavior", "ground")).lower().strip()
    if observed not in {"ground", "refuse", "split", "caveat"}:
        observed = "ground"
    matched = observed == expected_behavior
    return BoundaryResult(
        expected_behavior=expected_behavior,
        observed_behavior=observed,
        matched=matched,
        rationale=str(data.get("rationale", ""))[:400],
        score=1.0 if matched else 0.0,
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
