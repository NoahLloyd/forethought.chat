"""Multi-judge ensemble.

V1 ships with a single ClaudeJudge; the ensemble interface is in place so
adding a GPT and an open-weight judge later requires no changes to scorers.
Aggregation strategies: majority, all_agree, any. For continuous scores,
use mean (subclass and override `aggregate`).
"""

from __future__ import annotations

from collections import Counter
from typing import Literal

from forethought_bench.judges.base import Judge, JudgeRequest, JudgeResponse

Aggregation = Literal["majority", "all_agree", "any"]


class JudgeEnsemble(Judge):
    """Run a request against every member judge and aggregate verdicts.

    `complete` runs all judges in parallel and returns a synthetic
    JudgeResponse whose `text` is the aggregated verdict. Use `verdicts(...)`
    when you need the per-judge breakdown.
    """

    def __init__(self, judges: list[Judge], aggregation: Aggregation = "majority") -> None:
        if not judges:
            raise ValueError("JudgeEnsemble requires at least one judge")
        self._judges = judges
        self.model = "+".join(j.model for j in judges)
        self.name = f"ensemble:{self.model}"
        self._aggregation = aggregation

    async def complete(self, req: JudgeRequest) -> JudgeResponse:
        import asyncio

        responses = await asyncio.gather(*(j.complete(req) for j in self._judges))
        verdicts = [r.text.strip() for r in responses]
        aggregated = _aggregate(verdicts, self._aggregation)
        usage = {
            "members": [
                {"model": r.model, "usage": r.usage, "text": r.text} for r in responses
            ]
        }
        return JudgeResponse(text=aggregated, model=self.model, usage=usage)


def _aggregate(verdicts: list[str], how: Aggregation) -> str:
    if how == "majority":
        counts = Counter(verdicts).most_common()
        return counts[0][0]
    if how == "all_agree":
        return verdicts[0] if len(set(verdicts)) == 1 else "DISAGREE"
    if how == "any":
        return verdicts[0]
    raise ValueError(f"Unknown aggregation: {how}")
