"""Anthropic Claude judge with prompt caching.

The system prompt is sent with `cache_control: ephemeral` so that judges
sharing a rubric across many items (citation faithfulness, verbal match,
answer support, claim anchoring, numeric judging) get cache hits.
"""

from __future__ import annotations

from typing import Any

from anthropic import AsyncAnthropic

from forethought_bench._versions import JUDGE_CLAUDE
from forethought_bench.judges.base import Judge, JudgeRequest, JudgeResponse


class ClaudeJudge(Judge):
    def __init__(
        self,
        model: str = JUDGE_CLAUDE,
        client: AsyncAnthropic | None = None,
    ) -> None:
        self.model = model
        self.name = f"claude:{model}"
        self._client = client or AsyncAnthropic()

    async def complete(self, req: JudgeRequest) -> JudgeResponse:
        if req.cache_system:
            system: str | list[dict[str, Any]] = [
                {
                    "type": "text",
                    "text": req.system,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        else:
            system = req.system

        msg = await self._client.messages.create(
            model=self.model,
            system=system,
            messages=[{"role": "user", "content": req.user}],
            max_tokens=req.max_tokens,
            temperature=req.temperature,
        )
        text = "".join(getattr(b, "text", "") for b in msg.content)
        usage: dict[str, Any] = {
            "input_tokens": getattr(msg.usage, "input_tokens", None),
            "output_tokens": getattr(msg.usage, "output_tokens", None),
            "cache_creation_input_tokens": getattr(
                msg.usage, "cache_creation_input_tokens", None
            ),
            "cache_read_input_tokens": getattr(
                msg.usage, "cache_read_input_tokens", None
            ),
        }
        return JudgeResponse(text=text, model=self.model, usage=usage)
