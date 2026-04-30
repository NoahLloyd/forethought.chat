"""Verbal-match scorer for non-numeric claims.

Asks an LLM judge whether the agent's answer is semantically equivalent to
any of the item's accepted phrasings, in the context of the question.

Single-reference grading is brittle on paraphrase, which is why every grounded
item should have multiple accepted phrasings (per the design doc).
"""

from __future__ import annotations

from pydantic import BaseModel

from forethought_bench.judges import Judge, JudgeRequest

VERBAL_JUDGE_SYSTEM = """\
You are a benchmark grader. You will be shown a QUESTION, a list of ACCEPTED
ANSWERS (any of which is acceptable), and the AGENT's actual ANSWER.

Decide whether the agent's answer is semantically equivalent to AT LEAST ONE
of the accepted answers, in the context of the question. Equivalence allows
paraphrase but not different content.

Respond on the first line with EXACTLY one of:
  MATCH   : the agent's answer matches at least one accepted answer
  PARTIAL : the agent's answer overlaps but is materially weaker or narrower
  MISS    : the agent's answer does not match any accepted answer
Then 1-2 sentences of rationale.
"""

VERBAL_JUDGE_USER_TEMPLATE = """\
QUESTION: {question}

ACCEPTED ANSWERS (any one is sufficient):
{accepted}

AGENT ANSWER:
\"\"\"
{answer}
\"\"\"

VERDICT:"""


class VerbalResult(BaseModel):
    verdict: str  # MATCH | PARTIAL | MISS
    rationale: str
    accepted_phrasings: list[str]


async def score_verbal(
    question: str,
    answer: str,
    accepted_phrasings: list[str],
    judge: Judge,
) -> VerbalResult:
    if not accepted_phrasings:
        return VerbalResult(
            verdict="MISS",
            rationale="No accepted phrasings provided; verbal match cannot be graded.",
            accepted_phrasings=[],
        )

    accepted_block = "\n".join(f"  - {p}" for p in accepted_phrasings)
    resp = await judge.complete(
        JudgeRequest(
            system=VERBAL_JUDGE_SYSTEM,
            user=VERBAL_JUDGE_USER_TEMPLATE.format(
                question=question, accepted=accepted_block, answer=answer
            ),
            max_tokens=256,
        )
    )
    text = resp.text.strip()
    first = text.splitlines()[0].strip().rstrip(":").upper() if text else "MISS"
    if first.startswith("MATCH"):
        verdict = "MATCH"
    elif first.startswith("PARTIAL"):
        verdict = "PARTIAL"
    else:
        verdict = "MISS"
    return VerbalResult(
        verdict=verdict, rationale=text, accepted_phrasings=accepted_phrasings
    )
