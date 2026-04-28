"""Judge layer.

Judges are LLMs used by scorers (citation support, verbal match, rubric items).
The model under test must NEVER equal a judge model (self-preference bias).

V1: Claude-only. The Judge interface and JudgeEnsemble shell are in place
so a multi-judge ensemble (Claude + GPT + an open-weight) can be wired up
without touching scoring code.
"""

from forethought_bench.judges.base import Judge, JudgeRequest, JudgeResponse
from forethought_bench.judges.claude import ClaudeJudge
from forethought_bench.judges.ensemble import JudgeEnsemble

__all__ = ["ClaudeJudge", "Judge", "JudgeEnsemble", "JudgeRequest", "JudgeResponse"]
