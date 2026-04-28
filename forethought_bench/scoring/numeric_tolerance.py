"""Numeric answer extraction and tolerance-based grading."""

from __future__ import annotations

import re

from pydantic import BaseModel

from forethought_bench.schema import NumericTarget

# Numbers in the agent's prose: 50, 50%, 0.5, 1.5x, ~5X, 21x, $1 trillion, etc.
# Capture the leading numeric token; unit normalization happens downstream.
_NUM_RE = re.compile(
    r"""
    (?P<approx>~|approximately\s+|roughly\s+|about\s+|around\s+)?
    (?P<sign>-)?
    (?P<num>\d{1,3}(?:,\d{3})*(?:\.\d+)?|\.\d+)
    \s*
    (?P<suffix>%|x|X|×|\s+percent|\s+percentage\s+points?|trillion|billion|million)?
    """,
    re.VERBOSE,
)


class NumericResult(BaseModel):
    extracted: float | None
    target: float
    unit: str | None
    within_tolerance: bool
    distance: float | None  # absolute distance from target
    rationale: str  # why this verdict; helps debug bad extractions


def extract_numeric_value(
    text: str,
    *,
    prefer_unit: str | None = None,
) -> tuple[float | None, str]:
    """Extract a numeric value from prose.

    Returns (value, rationale). When `prefer_unit` is set (e.g. "probability"),
    we prefer percentages and 0-1 floats over arbitrary integers in the text.

    For probability targets the function:
      - returns 0.5 for both "50%" and "0.5"
      - returns 0.5 for "around half" via a small lookup
    For multiplier targets (unit="x") it strips the suffix.
    Currency / order-of-magnitude units are normalized to the bare number.
    """
    if not text:
        return None, "empty answer"

    lowered = text.lower()
    if prefer_unit == "probability":
        # Word-form probabilities — small lookup for the common cases.
        for word, value in _WORD_PROBS.items():
            if re.search(rf"\b{re.escape(word)}\b", lowered):
                return value, f"matched word '{word}' -> {value}"

    candidates: list[tuple[float, str]] = []
    for m in _NUM_RE.finditer(text):
        raw = m.group("num").replace(",", "")
        try:
            n = float(raw)
        except ValueError:
            continue
        if m.group("sign") == "-":
            n = -n
        suffix = (m.group("suffix") or "").strip().lower()

        if suffix in {"%", "percent", "percentage point", "percentage points"}:
            value = n / 100.0 if prefer_unit == "probability" else n
            candidates.append((value, f"{m.group(0).strip()!r} -> {value}"))
        elif suffix in {"x", "×"}:
            candidates.append((n, f"{m.group(0).strip()!r} -> {n}x"))
        elif suffix == "trillion":
            candidates.append((n * 1e12, f"{m.group(0).strip()!r} -> {n * 1e12}"))
        elif suffix == "billion":
            candidates.append((n * 1e9, f"{m.group(0).strip()!r} -> {n * 1e9}"))
        elif suffix == "million":
            candidates.append((n * 1e6, f"{m.group(0).strip()!r} -> {n * 1e6}"))
        else:
            # Bare number. For probability targets, accept 0..1 floats.
            if prefer_unit == "probability" and 0.0 <= n <= 1.0:
                candidates.append((n, f"bare float in [0,1]: {n}"))
            elif prefer_unit != "probability":
                candidates.append((n, f"bare number: {n}"))

    if not candidates:
        return None, "no numeric token matched"

    # Prefer the first candidate by default; for probability we already filtered.
    value, rat = candidates[0]
    return value, rat


def score_numeric(answer: str, target: NumericTarget) -> NumericResult:
    """Grade a numeric claim with rtol/atol tolerance.

    A pass requires |extracted - target| <= max(rtol * |target|, atol).
    """
    prefer_unit = target.unit
    extracted, rationale = extract_numeric_value(answer, prefer_unit=prefer_unit)
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


_WORD_PROBS: dict[str, float] = {
    "half": 0.5,
    "a third": 0.33,
    "two thirds": 0.67,
    "a quarter": 0.25,
    "three quarters": 0.75,
}
