"""Gate-specific scorers."""

from forethought_bench.gate.scoring.boundary import (
    BoundaryResult,
    classify_boundary_behavior,
)

__all__ = ["BoundaryResult", "classify_boundary_behavior"]
