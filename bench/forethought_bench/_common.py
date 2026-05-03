"""Shared task plumbing: item loading, dataset construction, agent solver.

This module is mode-agnostic. Each mode (librarian, gate, researcher) has its
own tasks/ subpackage that calls into here with its own mode name.

Tier filtering: items default to tier="smoke" (the small failure-mode-diverse
subset that runs in fast iteration). Pass tier="extended" to add the broader
items, or tier="all" to also include items some users mark as extended.

Held-out partition is orthogonal to tier: held_out items stay out of public
eval logs regardless of tier, unless include_held_out=True.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterable
from pathlib import Path
from typing import Literal

from inspect_ai.dataset import MemoryDataset, Sample
from inspect_ai.solver import Generate, Solver, TaskState, solver

from forethought_bench.agents import Agent, ClaudeCliAgent, ForethoughtChatAgent
from forethought_bench.schema import Item, TrackName

Tier = Literal["smoke", "extended", "all"]
Mode = Literal["librarian", "gate", "researcher"]


def items_root_for(mode: Mode) -> Path:
    """The items/<mode>/ directory under the bench root."""
    return Path(__file__).resolve().parents[1] / "items" / mode


def load_items_for_track(
    mode: Mode,
    track: TrackName,
    *,
    tier: Tier = "smoke",
    include_held_out: bool = False,
) -> list[Item]:
    """Load every item JSON for a track within a mode and apply tier + held-out filters.

    tier="smoke"    : only Item.tier == "smoke"  (default fast subset)
    tier="extended" : Item.tier in {"smoke", "extended"}  (full curated set)
    tier="all"      : every item, including ones with unknown tier values
    """
    track_dir = items_root_for(mode) / track.value
    if not track_dir.is_dir():
        return []
    items: list[Item] = []
    for jf in sorted(track_dir.glob("*.json")):
        if jf.name.startswith("_"):
            continue
        try:
            data = json.loads(jf.read_text())
        except json.JSONDecodeError:
            continue
        try:
            item = Item.model_validate(data)
        except Exception:
            continue
        if not include_held_out and item.held_out:
            continue
        if not _tier_matches(item.tier, tier):
            continue
        items.append(item)
    return items


def _tier_matches(item_tier: str, requested: Tier) -> bool:
    if requested == "all":
        return True
    if requested == "extended":
        return item_tier in {"smoke", "extended"}
    # requested == "smoke"
    return item_tier == "smoke"


def items_to_dataset(items: Iterable[Item]) -> MemoryDataset:
    samples = [
        Sample(
            id=item.id,
            input=item.question,
            target=_target_for(item),
            metadata={"item": item.model_dump(mode="json")},
        )
        for item in items
    ]
    return MemoryDataset(samples)


def _target_for(item: Item) -> str:
    if item.accepted_phrasings:
        return item.accepted_phrasings[0]
    if item.numeric_target is not None:
        unit = f" {item.numeric_target.unit}" if item.numeric_target.unit else ""
        return f"{item.numeric_target.value}{unit}"
    return ""


@solver
def agent_solver(agent: Agent) -> Solver:
    """Solver that runs an Agent and stashes the structured AgentOutput in
    state.metadata["agent_output"] for downstream scorers."""

    async def solve(state: TaskState, generate: Generate) -> TaskState:
        question = _state_question(state)
        output = await agent.answer(question)
        state.output.completion = output.final_answer
        state.metadata["agent_output"] = output.model_dump(mode="json")
        return state

    return solve


def _state_question(state: TaskState) -> str:
    txt = getattr(state, "input_text", None)
    if isinstance(txt, str):
        return txt
    inp = getattr(state, "input", None)
    if isinstance(inp, str):
        return inp
    if isinstance(inp, list) and inp:
        last = inp[-1]
        content = getattr(last, "content", None) or last.get("content")  # type: ignore[union-attr]
        if isinstance(content, str):
            return content
    return ""


def build_agent(base_url: str) -> Agent:
    """Pick the agent under test based on FOREBENCH_AGENT.

    "cli" (default) : ClaudeCliAgent — `claude -p`, subscription-billed.
                      Same prompt + retrieval as production. base_url is
                      ignored.
    "http"          : ForethoughtChatAgent — POSTs to {base_url}/api/chat.
                      Bills against ANTHROPIC_API_KEY. Use only when you
                      explicitly want to grade the deployed HTTP behavior.

    The default is intentionally "cli" because the previous default
    silently burned API spend even when the bench README claimed
    subscription billing. If you want the old behavior, set the env var
    explicitly.
    """
    mode = os.environ.get("FOREBENCH_AGENT", "cli").strip().lower()
    if mode == "http":
        return ForethoughtChatAgent(base_url=base_url)
    if mode == "cli":
        return ClaudeCliAgent()
    raise ValueError(
        f"FOREBENCH_AGENT must be 'cli' or 'http', got {mode!r}"
    )


def resolve_content_dir(content_dir: str | None) -> str:
    """Find the Forethought corpus content directory.

    Priority:
      1. explicit content_dir argument
      2. FORETHOUGHT_CONTENT_DIR env var
      3. monorepo sibling: ../web/data/content (relative to bench/)
      4. legacy fallback: ../forethoughtchat/data/content
      5. local cache: ./corpus_cache/
    """
    if content_dir:
        return content_dir
    env = os.environ.get("FORETHOUGHT_CONTENT_DIR")
    if env:
        return env
    # Monorepo layout: bench/ and web/ are siblings.
    bench_root = Path(__file__).resolve().parents[1]
    sibling_web = bench_root.parent / "web" / "data" / "content"
    if sibling_web.is_dir():
        return str(sibling_web)
    legacy = bench_root.parent / "forethoughtchat" / "data" / "content"
    if legacy.is_dir():
        return str(legacy)
    local = Path.cwd() / "corpus_cache"
    if local.is_dir():
        return str(local)
    raise FileNotFoundError(
        "Forethought content directory not found. Set FORETHOUGHT_CONTENT_DIR "
        "or pass -T content_dir=/path/to/web/data/content"
    )


def build_judge(judge_model: str):
    """Pick the judge based on FOREBENCH_USE_API.

    Default: subscription-billed (claude -p OAuth).
    Override with FOREBENCH_USE_API=1 to bill ANTHROPIC_API_KEY.
    """
    from forethought_bench.judges import ClaudeJudge, default_judge

    if os.environ.get("FOREBENCH_USE_API") == "1":
        resolved = {
            "haiku": "claude-haiku-4-5-20251001",
            "sonnet": "claude-sonnet-4-6",
            "opus": "claude-opus-4-7",
        }.get(judge_model, judge_model)
        return ClaudeJudge(model=resolved)
    return default_judge(model=judge_model)
