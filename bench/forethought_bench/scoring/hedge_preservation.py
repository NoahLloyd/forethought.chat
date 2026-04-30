"""Hedge preservation scorer.

Checks that the agent did not strip hedge tokens from a claim that the source
hedged. Concrete failure mode this catches: source says "we estimate ~50%"
and the agent says "Forethought says 50%", erasing the uncertainty.

V1 is conservative: pass if the agent's answer contains ANY of the source's
hedge tokens (case-insensitive substring) OR contains an equivalent hedge from
a small synonym set. False negatives are preferable to false positives at
this stage; tighten with an LLM judge once we have data on agent behavior.
"""

from __future__ import annotations

import re

from pydantic import BaseModel

# Equivalence groups - if the source hedge is in any group, any other token in
# the group counts as preservation. Keep small: hedge synonymy is brittle and
# we'd rather under-credit than over-credit.
_HEDGE_GROUPS: list[set[str]] = [
    {"~", "around", "approximately", "roughly", "about", "circa"},
    {"might", "may", "could", "possibly", "perhaps"},
    {"likely", "probably", "we estimate", "we think", "our best guess"},
    {"highly likely", "very likely"},
    {"somewhat unlikely", "unlikely"},
    {"plausibly", "plausible", "at least"},
]


class HedgeResult(BaseModel):
    source_hedges: list[str]
    preserved_hedges: list[str]
    missing_hedges: list[str]
    preserved: bool
    rationale: str


def score_hedge_preservation(answer: str, source_hedges: list[str]) -> HedgeResult:
    if not source_hedges:
        return HedgeResult(
            source_hedges=[],
            preserved_hedges=[],
            missing_hedges=[],
            preserved=True,
            rationale="No source hedges to preserve.",
        )

    answer_lower = answer.lower()
    preserved: list[str] = []
    missing: list[str] = []

    for hedge in source_hedges:
        if _hedge_present(hedge, answer_lower):
            preserved.append(hedge)
            continue
        # Group-based equivalence: any synonym in the same group counts.
        group = _group_of(hedge)
        if group is not None and any(_hedge_present(syn, answer_lower) for syn in group):
            preserved.append(hedge)
            continue
        missing.append(hedge)

    ok = len(missing) == 0
    return HedgeResult(
        source_hedges=source_hedges,
        preserved_hedges=preserved,
        missing_hedges=missing,
        preserved=ok,
        rationale=(
            "All source hedges (or equivalents) appear in the answer."
            if ok
            else f"Source hedges missing or stripped: {missing!r}"
        ),
    )


def _hedge_present(hedge: str, answer_lower: str) -> bool:
    h = hedge.lower().strip()
    if not h:
        return False
    if h == "~":
        return "~" in answer_lower
    return re.search(rf"\b{re.escape(h)}\b", answer_lower) is not None


def _group_of(hedge: str) -> set[str] | None:
    h = hedge.lower().strip()
    for group in _HEDGE_GROUPS:
        if h in group:
            return group
    return None
