"""Librarian-specific scorers (synthesis-only at present).

Shared scoring primitives — verbal_match, citation_faithfulness,
hedge_preservation, numeric_tolerance, rubric — live at
forethought_bench.scoring and are used by all modes.
"""

from forethought_bench.librarian.scoring.synthesis import (
    CitationRecall,
    IntegrationResult,
    score_citation_recall,
    score_integration,
)

__all__ = [
    "CitationRecall",
    "IntegrationResult",
    "score_citation_recall",
    "score_integration",
]
