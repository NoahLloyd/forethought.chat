"""Scoring primitives.

Per-track scorers live in tasks/<track>.py and compose the primitives below.
"""

from forethought_bench.scoring.boundary import (
    BoundaryResult,
    classify_boundary_behavior,
)
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
from forethought_bench.scoring.open_research import (
    OpenResearchResult,
    score_open_research,
)
from forethought_bench.scoring.rubric import (
    ElementResult,
    RubricResult,
    score_required_elements,
)
from forethought_bench.scoring.synthesis import (
    CitationRecall,
    IntegrationResult,
    score_citation_recall,
    score_integration,
)
from forethought_bench.scoring.verbal_match import (
    VerbalResult,
    score_verbal,
)

__all__ = [
    "BoundaryResult",
    "CitationRecall",
    "ElementResult",
    "HedgeResult",
    "IntegrationResult",
    "NumericResult",
    "OpenResearchResult",
    "RubricResult",
    "VerbalResult",
    "check_all_citations",
    "check_citation",
    "classify_boundary_behavior",
    "extract_numeric_value",
    "faithfulness_score",
    "score_citation_recall",
    "score_hedge_preservation",
    "score_integration",
    "score_numeric",
    "score_open_research",
    "score_required_elements",
    "score_verbal",
]
