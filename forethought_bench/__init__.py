"""forethought-bench: benchmark for agents grounded in Forethought Research's corpus."""

from forethought_bench._versions import (
    BENCHMARK_VERSION,
    EXTRACTOR,
    JUDGE_CLAUDE,
    JUDGE_OPENAI,
    JUDGE_OPEN_WEIGHT,
)
from forethought_bench.schema import (
    AgentOutput,
    Citation,
    CitationRef,
    Item,
    NumericTarget,
    NumericTolerance,
    RetrievedPassage,
    TrackName,
)

__all__ = [
    "BENCHMARK_VERSION",
    "EXTRACTOR",
    "JUDGE_CLAUDE",
    "JUDGE_OPENAI",
    "JUDGE_OPEN_WEIGHT",
    "AgentOutput",
    "Citation",
    "CitationRef",
    "Item",
    "NumericTarget",
    "NumericTolerance",
    "RetrievedPassage",
    "TrackName",
]
