"""Shared task plumbing: item loading, dataset construction, agent solver.

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

from forethought_bench.agents import Agent
from forethought_bench.schema import Item, TrackName

Tier = Literal["smoke", "extended", "all"]


def items_root() -> Path:
    """The items/ directory at the repo root."""
    return Path(__file__).resolve().parents[2] / "items"


def load_items_for_track(
    track: TrackName,
    *,
    tier: Tier = "smoke",
    include_held_out: bool = False,
) -> list[Item]:
    """Load every item JSON for a track and apply tier + held-out filters.

    tier="smoke"    : only Item.tier == "smoke"  (default fast subset)
    tier="extended" : Item.tier in {"smoke", "extended"}  (full curated set)
    tier="all"      : every item, including ones with unknown tier values
    """
    track_dir = items_root() / track.value
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
    bench_root = Path(__file__).resolve().parents[2]
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
