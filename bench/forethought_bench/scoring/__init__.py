"""Shared scoring primitives, used by all modes.

Mode-specific scorers live alongside their tasks:
  - Librarian:   forethought_bench.librarian.scoring  (synthesis: citation_recall, integration)
  - Gate:        forethought_bench.gate.scoring       (boundary: behavioral classifier)
  - Researcher:  forethought_bench.researcher.scoring (open_research: 4-axis rubric)

Per-track composite scorers live in <mode>/tasks/<track>.py and compose
the primitives below.
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
from forethought_bench.scoring.rubric import (
    ElementResult,
    RubricResult,
    score_required_elements,
)
from forethought_bench.scoring.verbal_match import (
    VerbalResult,
    score_verbal,
)

__all__ = [
    "ElementResult",
    "HedgeResult",
    "NumericResult",
    "RubricResult",
    "VerbalResult",
    "check_all_citations",
    "check_citation",
    "extract_numeric_value",
    "faithfulness_score",
    "score_hedge_preservation",
    "score_numeric",
    "score_required_elements",
    "score_verbal",
]
