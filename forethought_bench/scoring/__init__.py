"""Scoring primitives.

Each module is a focused scorer; tasks compose them into per-track scoring.
- citation_faithfulness: 4-stage pipeline (the most load-bearing piece per the design doc).
- numeric_tolerance: numeric answers within rtol/atol of target.
- hedge_preservation: did the agent strip hedges from a hedged source claim?
- verbal_match: LLM judge against a list of accepted phrasings.
"""

from forethought_bench.scoring.citation_faithfulness import (
    check_all_citations,
    check_citation,
    faithfulness_score,
)
from forethought_bench.scoring.hedge_preservation import (
    HedgeResult,
    score_hedge_preservation,
)
from forethought_bench.scoring.numeric_tolerance import (
    NumericResult,
    extract_numeric_value,
    score_numeric,
)
from forethought_bench.scoring.verbal_match import (
    VerbalResult,
    score_verbal,
)

__all__ = [
    "HedgeResult",
    "NumericResult",
    "VerbalResult",
    "check_all_citations",
    "check_citation",
    "extract_numeric_value",
    "faithfulness_score",
    "score_hedge_preservation",
    "score_numeric",
    "score_verbal",
]
