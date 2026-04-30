"""Judge layer.

Judges are LLMs used by scorers (citation support, verbal match, rubric items).
The model under test must NEVER equal a judge model (self-preference bias).

V1 ships:
  - ClaudeJudge       : direct Anthropic API (billed via ANTHROPIC_API_KEY)
  - ClaudeCodeJudge   : subprocess wrapper around `claude -p` (billed via
                        OAuth subscription; preferred when the CLI is
                        installed and authenticated)
  - JudgeEnsemble     : multi-judge majority/consensus (Claude-only for now)

Build a judge with the right billing path:
  >>> from forethought_bench.judges import default_judge
  >>> judge = default_judge(model="haiku")  # subscription if available
"""

from forethought_bench.judges.base import Judge, JudgeRequest, JudgeResponse
from forethought_bench.judges.claude import ClaudeJudge
from forethought_bench.judges.claude_code import ClaudeCodeJudge
from forethought_bench.judges.ensemble import JudgeEnsemble


def default_judge(model: str = "haiku") -> Judge:
    """Build a judge that prefers Claude Code subscription billing.

    - If the `claude` CLI is on PATH, returns ClaudeCodeJudge (OAuth path).
    - Otherwise falls back to ClaudeJudge (API key) with model alias resolved
      to the latest pinned version from `_versions.py`.
    """
    try:
        return ClaudeCodeJudge(model=model)
    except FileNotFoundError:
        from forethought_bench._versions import (
            JUDGE_CLAUDE,
            JUDGE_OPENAI,
        )
        # Resolve common aliases to the pinned API model id.
        resolved = {
            "haiku": "claude-haiku-4-5-20251001",
            "sonnet": JUDGE_CLAUDE,
            "opus": "claude-opus-4-7",
        }.get(model, model)
        return ClaudeJudge(model=resolved)


__all__ = [
    "ClaudeCodeJudge",
    "ClaudeJudge",
    "Judge",
    "JudgeEnsemble",
    "JudgeRequest",
    "JudgeResponse",
    "default_judge",
]
