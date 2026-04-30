"""Numeric answer extraction and tolerance-based grading.

Bug fixed in this version: the previous regex parsed multi-digit runs as
1-3-digit prefixes (so "AI 2027" became "202" + "7") because the digit class
was capped at three. The new pattern uses a comma-grouped-or-greedy
alternation so "2027" parses as one number and "200,000" still parses as one.

Also new: when target.unit is "x" or "probability", we filter candidate
matches to the unit-appropriate ones before picking the answer. This prevents
bare numbers (years, doc IDs, citation markers) from outranking the actual
unit-bearing match the benchmark cares about.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from pydantic import BaseModel

from forethought_bench.schema import NumericTarget

# Regex notes (re.VERBOSE | re.IGNORECASE):
#   - Comma-grouped alternative ("1,234,567") is FIRST so it wins over the
#     plain-digits alternative on backtrack.
#   - Plain alternative is greedy `\d+(?:\.\d+)?` so 2027 stays a single
#     token; the old `\d{1,3}` could stop at 3 digits.
#   - Suffix `fold` / `-fold` covers "8-fold" / "5 fold" multipliers.
_NUM_RE = re.compile(
    r"""
    (?P<approx>~|approximately\s+|roughly\s+|about\s+|around\s+)?
    (?P<sign>-)?
    (?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)
    \s*
    (?P<suffix>%|x|×|fold|-fold|percent|percentage\s+points?|trillion|billion|million)?
    """,
    re.VERBOSE | re.IGNORECASE,
)

_WORD_PROBS: dict[str, float] = {
    "half": 0.5,
    "a third": 0.33,
    "two thirds": 0.67,
    "a quarter": 0.25,
    "three quarters": 0.75,
}


class NumericResult(BaseModel):
    extracted: float | None
    target: float
    unit: str | None
    within_tolerance: bool
    distance: float | None
    rationale: str


@dataclass(frozen=True)
class _Candidate:
    value: float
    suffix: str  # normalized: "%", "x", "fold", "trillion", ... or "" for bare
    surface: str
    rationale: str


def extract_numeric_value(
    text: str,
    *,
    prefer_unit: str | None = None,
) -> tuple[float | None, str]:
    """Extract a numeric value from prose.

    Returns (value, rationale). When `prefer_unit` is set, candidates that
    don't match the unit are filtered out before the first-match-wins rule.
    """
    if not text:
        return None, "empty answer"

    candidates = _candidates(text, prefer_unit=prefer_unit)
    if not candidates:
        return None, "no numeric token matched"

    filtered = _filter_for_unit(candidates, prefer_unit)
    chosen = filtered[0] if filtered else candidates[0]
    return chosen.value, chosen.rationale


def score_numeric(answer: str, target: NumericTarget) -> NumericResult:
    """Grade a numeric claim.

    Pass requires |extracted - target| <= max(rtol * |target|, atol).
    """
    extracted, rationale = extract_numeric_value(answer, prefer_unit=target.unit)
    if extracted is None:
        return NumericResult(
            extracted=None,
            target=target.value,
            unit=target.unit,
            within_tolerance=False,
            distance=None,
            rationale=f"no numeric value extracted ({rationale})",
        )
    distance = abs(extracted - target.value)
    bound = max(target.tolerance.rtol * abs(target.value), target.tolerance.atol)
    return NumericResult(
        extracted=extracted,
        target=target.value,
        unit=target.unit,
        within_tolerance=distance <= bound,
        distance=distance,
        rationale=(
            f"extracted={extracted}, target={target.value}, |diff|={distance:.4g}, "
            f"bound={bound:.4g}; {rationale}"
        ),
    )


def _candidates(text: str, *, prefer_unit: str | None) -> list[_Candidate]:
    out: list[_Candidate] = []
    lowered = text.lower()

    if prefer_unit == "probability":
        for word, value in _WORD_PROBS.items():
            if re.search(rf"\b{re.escape(word)}\b", lowered):
                out.append(
                    _Candidate(
                        value=value,
                        suffix="word_prob",
                        surface=word,
                        rationale=f"matched word '{word}' -> {value}",
                    )
                )

    for m in _NUM_RE.finditer(text):
        raw = m.group("num").replace(",", "")
        try:
            n = float(raw)
        except ValueError:
            continue
        if m.group("sign") == "-":
            n = -n
        suffix = _normalize_suffix((m.group("suffix") or "").strip().lower())
        surface = m.group(0).strip()

        if suffix == "%":
            value = n / 100.0 if prefer_unit == "probability" else n
            out.append(
                _Candidate(
                    value=value, suffix="%", surface=surface,
                    rationale=f"{surface!r} -> {value}",
                )
            )
        elif suffix in {"x", "fold"}:
            out.append(
                _Candidate(
                    value=n, suffix=suffix, surface=surface,
                    rationale=f"{surface!r} -> {n}{suffix}",
                )
            )
        elif suffix == "trillion":
            out.append(_Candidate(value=n * 1e12, suffix=suffix, surface=surface,
                                   rationale=f"{surface!r} -> {n * 1e12}"))
        elif suffix == "billion":
            out.append(_Candidate(value=n * 1e9, suffix=suffix, surface=surface,
                                   rationale=f"{surface!r} -> {n * 1e9}"))
        elif suffix == "million":
            out.append(_Candidate(value=n * 1e6, suffix=suffix, surface=surface,
                                   rationale=f"{surface!r} -> {n * 1e6}"))
        else:
            out.append(_Candidate(value=n, suffix="", surface=surface,
                                   rationale=f"bare number: {n}"))
    return out


def _filter_for_unit(
    candidates: list[_Candidate], prefer_unit: str | None
) -> list[_Candidate]:
    if prefer_unit == "x":
        return [c for c in candidates if c.suffix in {"x", "fold"}]
    if prefer_unit == "probability":
        return [
            c for c in candidates
            if c.suffix in {"%", "word_prob"}
            or (c.suffix == "" and 0.0 <= c.value <= 1.0)
        ]
    return candidates


def _normalize_suffix(s: str) -> str:
    if not s:
        return ""
    if s in {"x", "×"}:
        return "x"
    if s in {"fold", "-fold"}:
        return "fold"
    if s == "%":
        return "%"
    if s.startswith(("percent", "percentage")):
        return "%"
    if s in {"trillion", "billion", "million"}:
        return s
    return s
