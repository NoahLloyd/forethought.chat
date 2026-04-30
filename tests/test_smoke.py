"""Smoke tests for scorers and corpus loader.

Offline-only: no network, no LLM. Async pieces (verbal match, citation
faithfulness) are exercised in tests gated on a Claude judge being available.
"""

from __future__ import annotations

import json
from pathlib import Path

from forethought_bench.agents.forethought_chat import (
    extract_citations_from_markers,
)
from forethought_bench.schema import (
    Item,
    NumericTarget,
    NumericTolerance,
    TrackName,
)
from forethought_bench.scoring import (
    extract_numeric_value,
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


def test_numeric_year_does_not_split_into_three_digits() -> None:
    """Regression: 'AI 2027' used to be parsed as 202, leaking into the
    extracted value. Confirm 2027 stays a single token."""
    extracted, rationale = extract_numeric_value("AI 2027 study reports")
    assert extracted == 2027.0, rationale


def test_numeric_year_filtered_out_when_target_is_multiplier() -> None:
    """'AI 2027 ... 21x' with unit=x should choose 21, not 2027."""
    target = NumericTarget(value=21.0, unit="x")
    res = score_numeric("AI 2027 reports a factor of 21X", target)
    assert res.extracted == 21.0
    assert res.within_tolerance is True


def test_numeric_year_filtered_out_when_target_is_probability() -> None:
    """A year mentioned in passing should not be picked up for unit=probability."""
    target = NumericTarget(value=0.20, unit="probability")
    res = score_numeric(
        "In their 2022 paper, the authors give 20% subjective probability", target
    )
    assert res.extracted == 0.20
    assert res.within_tolerance is True


def test_numeric_grouped_thousands_still_parse() -> None:
    """Regression: 'increased by 8X to 200,000' should still parse 200,000 as
    a single token where useful. (Filtered out when unit=x.)"""
    extracted, _ = extract_numeric_value("scaled to 200,000 examples")
    assert extracted == 200000.0


def test_numeric_8_fold_multiplier() -> None:
    target = NumericTarget(value=8.0, unit="x")
    res = score_numeric("Britain's GDP share increased 8-fold from 1500 to 1900", target)
    assert res.extracted == 8.0
    assert res.within_tolerance is True


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


def test_hedge_multi_word_synonym_via_group() -> None:
    """`highly likely` and `very likely` are in the same equivalence group."""
    res = score_hedge_preservation(
        "the result is very likely correct", ["highly likely"]
    )
    assert res.preserved is True, res.rationale


def test_hedge_multi_word_phrase_direct_match() -> None:
    """Direct multi-word phrase matching (e.g. 'we think' inside prose)."""
    res = score_hedge_preservation(
        "We think this is the right answer", ["we think"]
    )
    assert res.preserved is True


def test_items_parse() -> None:
    items_dir = Path(__file__).resolve().parents[1] / "items" / "claim_recall"
    files = list(items_dir.glob("*.json"))
    assert len(files) >= 8
    for f in files:
        item = Item.model_validate(json.loads(f.read_text()))
        assert item.track == TrackName.CLAIM_RECALL
        assert item.expected_citation is not None
        assert item.source_passage
        if item.claim_type == "numeric":
            assert item.numeric_target is not None


def test_extract_citations_from_markers_threads_snippets() -> None:
    """The marker-based extractor must populate Citation.passage from
    sources[N].snippet, not leave it None. This is the passage-threading fix."""
    sources = [
        {
            "marker": 1,
            "url": "https://example.com/a",
            "title": "Paper A",
            "snippet": "The chip technology feedback loop by itself is probably "
                       "enough to sustain accelerating progress (~65%).",
        },
        {
            "marker": 2,
            "url": "https://example.com/b",
            "title": "Paper B",
            "snippet": "Britain's share of world GDP increased 8X.",
        },
    ]
    prose = (
        "The authors give ~65% to the chip technology feedback loop alone [1]. "
        "Britain's GDP share grew 8-fold during the industrial revolution [2]."
    )
    cits = extract_citations_from_markers(prose, sources)
    assert len(cits) == 2
    assert cits[0].url == "https://example.com/a"
    assert cits[0].passage and "65%" in cits[0].passage
    assert cits[0].supports and "chip technology" in cits[0].supports
    assert cits[1].url == "https://example.com/b"
    assert cits[1].passage and "8X" in cits[1].passage


def test_extract_citations_dedupes_repeated_markers() -> None:
    sources = [{"marker": 3, "url": "u", "title": "t", "snippet": "snip"}]
    prose = "Same claim [3]. Different claim with the same source [3]."
    cits = extract_citations_from_markers(prose, sources)
    assert len(cits) == 2  # different sentences -> different claims


def test_extract_citations_handles_compound_markers() -> None:
    sources = [
        {"marker": 1, "url": "u1", "title": "t1", "snippet": "s1"},
        {"marker": 6, "url": "u6", "title": "t6", "snippet": "s6"},
    ]
    prose = "Combined claim cited from two sources [1, 6]."
    cits = extract_citations_from_markers(prose, sources)
    assert len(cits) == 2
    assert {c.url for c in cits} == {"u1", "u6"}


def test_tier_filter_smoke_only_returns_smoke_items() -> None:
    from forethought_bench.schema import TrackName
    from forethought_bench.tasks._common import load_items_for_track
    smoke = load_items_for_track(TrackName.CLAIM_RECALL, tier="smoke")
    extended = load_items_for_track(TrackName.CLAIM_RECALL, tier="extended")
    all_ = load_items_for_track(TrackName.CLAIM_RECALL, tier="all")
    assert len(smoke) == 5
    assert len(extended) == 8
    assert len(all_) == 8
    # Smoke set: items 001, 004, 006, 007, 008
    smoke_ids = {i.id for i in smoke}
    assert smoke_ids == {
        "claim_recall_001",
        "claim_recall_004",
        "claim_recall_006",
        "claim_recall_007",
        "claim_recall_008",
    }
