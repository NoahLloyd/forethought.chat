"""Claude Code subscription-billed judge.

Wraps the `claude` CLI in headless mode (`-p / --print`) so judge calls bill
against the user's Pro/Max subscription (OAuth via keychain) instead of API
costs.

Auth: default Claude Code mode reads OAuth from the system keychain. We
strip ANTHROPIC_API_KEY from the subprocess env so the CLI does NOT fall
back to API billing if both are present.

Performance: each call is a fresh subprocess (~3-5s per call even at warm
cache). For Track 2's 8 items that's roughly 4 minutes total versus ~30s
via the API, but the cost savings can be substantial on Max.

Failure surfaces:
- claude CLI not on PATH        -> FileNotFoundError at construct time
- CLI exits non-zero            -> RuntimeError with stderr
- CLI returns is_error=true     -> RuntimeError with the error text
- timeout exceeded              -> RuntimeError, subprocess killed
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
from typing import Any

from forethought_bench.judges.base import Judge, JudgeRequest, JudgeResponse


class ClaudeCodeJudge(Judge):
    def __init__(
        self,
        model: str = "haiku",
        *,
        claude_path: str | None = None,
        timeout_s: float = 120.0,
    ) -> None:
        path = claude_path or shutil.which("claude")
        if not path:
            raise FileNotFoundError(
                "claude CLI not found on PATH. Install Claude Code and run "
                "`claude` once to authenticate, or use ClaudeJudge to fall "
                "back to API billing."
            )
        self.model = model
        self.name = f"claude-code:{model}"
        self._claude_path = path
        self._timeout = timeout_s

    async def complete(self, req: JudgeRequest) -> JudgeResponse:
        last_err: RuntimeError | None = None
        for attempt in range(3):
            try:
                return await self._complete_attempt(req)
            except RuntimeError as e:
                if "claude CLI failed (exit " not in str(e) or attempt == 2:
                    raise
                last_err = e
                await asyncio.sleep(2.0 + 3.0 * attempt)
        assert last_err is not None
        raise last_err

    async def _complete_attempt(self, req: JudgeRequest) -> JudgeResponse:
        argv = [
            self._claude_path,
            "-p",
            req.user,
            "--system-prompt",
            req.system,
            "--model",
            self.model,
            "--output-format",
            "json",
            "--no-session-persistence",
            "--permission-mode",
            "default",
        ]
        env = os.environ.copy()
        # Force OAuth/subscription path: don't let the CLI silently fall back
        # to API-key billing if ANTHROPIC_API_KEY is present in the parent env.
        env.pop("ANTHROPIC_API_KEY", None)

        proc = await asyncio.create_subprocess_exec(
            *argv,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=self._timeout
            )
        except TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError(f"claude CLI timed out after {self._timeout}s") from None

        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace")[:1000]
            raise RuntimeError(f"claude CLI failed (exit {proc.returncode}): {err}")

        try:
            envelope = json.loads(stdout)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"claude CLI did not emit valid JSON: {stdout[:500]!r}"
            ) from e

        if envelope.get("is_error"):
            raise RuntimeError(
                f"claude CLI returned error: {envelope.get('result')!r}"
            )

        text = _strip_code_fence(str(envelope.get("result", "")))

        usage_in = envelope.get("usage", {}) or {}
        usage: dict[str, Any] = {
            "input_tokens": usage_in.get("input_tokens"),
            "output_tokens": usage_in.get("output_tokens"),
            "cache_creation_input_tokens": usage_in.get("cache_creation_input_tokens"),
            "cache_read_input_tokens": usage_in.get("cache_read_input_tokens"),
            "notional_cost_usd": envelope.get("total_cost_usd"),
            "models_used": list((envelope.get("modelUsage") or {}).keys()),
            "duration_ms": envelope.get("duration_ms"),
        }
        return JudgeResponse(text=text, model=self.model, usage=usage)


def _strip_code_fence(text: str) -> str:
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json|markdown|text)?\s*", "", s)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()
