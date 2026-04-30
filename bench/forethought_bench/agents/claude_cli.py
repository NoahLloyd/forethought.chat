"""Subscription-billed bench agent.

Wraps `claude -p` (which authenticates against the user's Claude Pro/Max
OAuth in the keychain) so the model under test bills against subscription,
not API. Mirrors the production chat agent's behavior:

  - Same persona + corpus catalog system prompt (loaded via
    bench/scripts/forethought-preamble.sh, which calls into
    `@forethought/agent`'s `buildStablePreamble`).
  - Same retrieval (BM25 over the same data/index.json), exposed to the
    model as a Bash tool that invokes
    bench/scripts/forethought-search.sh.
  - Same `[N]` citation marker convention (markers persist across searches
    within one question via a JSONL file passed in env).

Why this exists: bench/forethought_bench/agents/forethought_chat.py POSTs
to the chat app's /api/chat, which uses `ANTHROPIC_API_KEY`. Even when the
JUDGE goes through `claude -p` (subscription), the agent under test was
quietly burning ~$3-5 per smoke run on API. This adapter closes that gap.

Auth: we strip ANTHROPIC_API_KEY from the subprocess env so the CLI does
NOT silently fall back to API billing if both are present in the parent.

Tool surface: claude -p is given Bash only, with permission-mode auto so
it doesn't prompt. The system prompt instructs it to use exactly one bash
command (the search wrapper) and not to touch other tools. The wrapper
script is the only path the bench expects it to call; if claude wanders
off that, sources just won't be recorded for those calls and citations
will fall through to "fabricated" in the faithfulness scorer - which is
the right failure mode (the bench should grade it as a bad answer, not
mask it).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from forethought_bench.agents.base import Agent
from forethought_bench.agents.forethought_chat import (
    extract_citations_from_markers,
)
from forethought_bench.schema import AgentOutput, RetrievedPassage

_TOOL_INSTRUCTIONS_TEMPLATE = """\

# IMPORTANT: replacement for the native `search` tool

In this run you do NOT have a native `search` tool. Instead, the Bash
tool is the ONLY tool you have, and it is restricted to running this
exact command shape:

    bash {script_path} "<your query>" [k]

- To search the Forethought corpus, run that command (with `k` defaulting
  to 6, max 10). Stdout will contain numbered excerpts in the same format
  the native search tool would have returned, including stable `[N]`
  citation markers that persist across calls.
- Cite using `[N]` markers exactly as you would have with the native
  tool. Markers stay stable across multiple searches in this run.
- Do NOT run any other shell command. Do NOT use Read, Write, Edit,
  Grep, Glob, or any other tool. Only Bash, only the search command
  above.
- After you have enough context, write your final answer in plain prose
  with `[N]` citations. Stop calling search once you can answer well.
"""


class ClaudeCliAgent(Agent):
    """Subscription-billed agent under test for the bench.

    Same prompt + retrieval as the production chat agent, but the LLM
    runs through `claude -p` instead of the Anthropic API.
    """

    def __init__(
        self,
        *,
        claude_path: str | None = None,
        repo_root: Path | None = None,
        model: str | None = None,
        timeout_s: float = 300.0,
    ) -> None:
        path = claude_path or shutil.which("claude")
        if not path:
            raise FileNotFoundError(
                "claude CLI not found on PATH. Install Claude Code and run "
                "`claude` once to authenticate, or set FOREBENCH_AGENT=http "
                "to use the API-billed HTTP path."
            )
        self._claude_path = path
        # Resolve repo root: this file is at
        # bench/forethought_bench/agents/claude_cli.py, so 3 parents up.
        self._repo_root = (
            repo_root or Path(__file__).resolve().parents[3]
        )
        self._search_script = (
            self._repo_root / "bench" / "scripts" / "forethought-search.sh"
        )
        self._preamble_script = (
            self._repo_root / "bench" / "scripts" / "forethought-preamble.sh"
        )
        if not self._search_script.exists():
            raise FileNotFoundError(
                f"search wrapper missing: {self._search_script}"
            )
        if not self._preamble_script.exists():
            raise FileNotFoundError(
                f"preamble wrapper missing: {self._preamble_script}"
            )
        self._model = model
        self._timeout = timeout_s
        self._preamble: str | None = None
        self._preamble_lock = asyncio.Lock()
        self.name = f"claude-cli:{model or 'default'}"

    async def answer(self, question: str) -> AgentOutput:
        preamble = await self._get_preamble()
        system_prompt = preamble + _TOOL_INSTRUCTIONS_TEMPLATE.format(
            script_path=str(self._search_script),
        )

        with tempfile.NamedTemporaryFile(
            prefix="bench_sources_",
            suffix=".jsonl",
            delete=False,
        ) as tmp:
            sources_path = Path(tmp.name)
        try:
            return await self._run_one(question, system_prompt, sources_path)
        finally:
            with contextlib.suppress(FileNotFoundError):
                sources_path.unlink()

    async def _get_preamble(self) -> str:
        if self._preamble is not None:
            return self._preamble
        async with self._preamble_lock:
            if self._preamble is not None:
                return self._preamble
            proc = await asyncio.create_subprocess_exec(
                "bash",
                str(self._preamble_script),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                err = stderr.decode("utf-8", errors="replace")[:1000]
                raise RuntimeError(
                    f"forethought-preamble.sh failed (exit {proc.returncode}): {err}"
                )
            self._preamble = stdout.decode("utf-8")
            return self._preamble

    async def _run_one(
        self, question: str, system_prompt: str, sources_path: Path
    ) -> AgentOutput:
        argv = [
            self._claude_path,
            "-p",
            question,
            "--append-system-prompt",
            system_prompt,
            "--allowedTools",
            "Bash",
            "--permission-mode",
            "bypassPermissions",
            "--output-format",
            "json",
            "--no-session-persistence",
        ]
        if self._model:
            argv += ["--model", self._model]

        env = os.environ.copy()
        # Force OAuth/subscription billing: never let the CLI fall back to
        # API-key billing if ANTHROPIC_API_KEY is in the parent env.
        env.pop("ANTHROPIC_API_KEY", None)
        env["BENCH_SOURCES_OUT"] = str(sources_path)

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
            raise RuntimeError(
                f"claude -p timed out after {self._timeout}s on question: {question[:80]!r}"
            ) from None

        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace")[:2000]
            raise RuntimeError(f"claude -p failed (exit {proc.returncode}): {err}")

        try:
            envelope = json.loads(stdout)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"claude -p did not emit valid JSON: {stdout[:500]!r}"
            ) from e

        if envelope.get("is_error"):
            raise RuntimeError(
                f"claude -p returned error: {envelope.get('result')!r}"
            )

        prose = _strip_code_fence(str(envelope.get("result", "")))

        sources = _read_sources(sources_path)
        retrieved_passages = [
            RetrievedPassage(
                url=s.get("url"),
                title=s.get("title"),
                text=s.get("snippet", ""),
            )
            for s in sources
        ]
        # The chat-agent helper walks `[N]` markers in the prose and pairs
        # them with source records of the same shape we emit (marker, url,
        # title, snippet). Reuse it directly.
        citations = extract_citations_from_markers(prose, sources)
        search_queries = _extract_search_queries(envelope)

        return AgentOutput(
            final_answer=prose,
            citations=citations,
            confidence=None,
            search_queries=search_queries,
            retrieved_passages=retrieved_passages,
            raw=prose,
        )


def _strip_code_fence(text: str) -> str:
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json|markdown|text)?\s*", "", s)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _read_sources(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    out: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(rec, dict):
            out.append(rec)
    out.sort(key=lambda r: int(r.get("marker", 0)))
    return out


_BASH_INPUT_QUERY_RE = re.compile(
    r"""bash\s+\S+forethought-search\.sh\s+(?P<q>"[^"]*"|'[^']*'|\S+)""",
)


def _extract_search_queries(envelope: dict[str, Any]) -> list[str]:
    """Pull out the search queries claude executed.

    `claude -p --output-format json` (without --include-partial-messages)
    surfaces only the final result, not tool-call traces. We can still
    recover queries from messages if they're present; otherwise leave
    empty - the bench doesn't strictly need them, only the synthesis
    track grades search-query quality.
    """
    queries: list[str] = []
    messages = envelope.get("messages")
    if not isinstance(messages, list):
        return queries
    for m in messages:
        if not isinstance(m, dict):
            continue
        content = m.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "tool_use":
                continue
            inp = block.get("input")
            if not isinstance(inp, dict):
                continue
            cmd = inp.get("command")
            if not isinstance(cmd, str):
                continue
            m2 = _BASH_INPUT_QUERY_RE.search(cmd)
            if m2 is None:
                continue
            raw = m2.group("q")
            if (raw.startswith('"') and raw.endswith('"')) or (
                raw.startswith("'") and raw.endswith("'")
            ):
                raw = raw[1:-1]
            if raw:
                queries.append(raw)
    return queries
