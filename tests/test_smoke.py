"""Smoke tests for scorers and corpus loader.

These run without network: numeric extraction, hedge preservation, and the
file-based corpus loader. The async scorers (verbal, citation faithfulness)
are exercised in tests that gate on ANTHROPIC_API_KEY; for V1 they stay
offline-only as a sanity check that the wiring at least imports.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from forethought_bench.schema import (
    Item,
    NumericTarget,
    NumericTolerance,
    TrackName,
)
from forethought_bench.scoring import (
    score_hedge_preservation,
    score_numeric,
)


def test_numeric_extracts_percent_for_probability_target() -> None:
    target = NumericTarget(
        value=0.50, unit="probability", tolerance=NumericTolerance(rtol=0.15, atol=0.05)
    )
    res = score_numeric("Around 50% likely", target)
    assert res.extracted == 0.5
    assert res.within_tolerance is True


def test_numeric_extracts_bare_float_for_probability_target() -> None:
    target = NumericTarget(
        value=0.50, unit="probability", tolerance=NumericTolerance(rtol=0.15, atol=0.05)
    )
    res = score_numeric("approximately 0.5", target)
    assert res.extracted == 0.5
    assert res.within_tolerance is True


def test_numeric_extracts_x_multiplier() -> None:
    target = NumericTarget(value=5.0, unit="x")
    res = score_numeric("a geometric mean of 5X across responses", target)
    assert res.extracted == 5.0
    assert res.within_tolerance is True


def test_numeric_outside_tolerance_fails() -> None:
    target = NumericTarget(
        value=0.50, unit="probability", tolerance=NumericTolerance(rtol=0.10, atol=0.05)
    )
    res = score_numeric("around 70%", target)
    assert res.extracted == 0.7
    assert res.within_tolerance is False


def test_hedge_preservation_passes_when_synonym_present() -> None:
    res = score_hedge_preservation("we estimate around 50% probability", ["~"])
    assert res.preserved is True


def test_hedge_preservation_fails_when_stripped() -> None:
    res = score_hedge_preservation("Forethought says 50%.", ["~", "might"])
    assert res.preserved is False
    assert "~" in res.missing_hedges


def test_hedge_preservation_vacuous_when_no_source_hedges() -> None:
    res = score_hedge_preservation("anything", [])
    assert res.preserved is True


def test_items_parse() -> None:
    items_dir = Path(__file__).resolve().parents[1] / "items" / "claim_recall"
    files = [p for p in items_dir.glob("*.json")]
    assert len(files) >= 8
    for f in files:
        item = Item.model_validate(json.loads(f.read_text()))
        assert item.track == TrackName.CLAIM_RECALL
        assert item.expected_citation is not None
        assert item.source_passage
        if item.claim_type == "numeric":
            assert item.numeric_target is not None
