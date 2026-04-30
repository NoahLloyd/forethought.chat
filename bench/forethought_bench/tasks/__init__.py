"""Inspect AI Task definitions, one per track.

Tracks:
  1. definitions       (stub)
  2. claim_recall      (V1, fully wired)
  3. arguments         (stub)
  4. synthesis         (stub)
  5. boundary          (stub)
  6. open_research     (stub)
"""

from forethought_bench.tasks.arguments import arguments
from forethought_bench.tasks.boundary import boundary
from forethought_bench.tasks.claim_recall import claim_recall
from forethought_bench.tasks.definitions import definitions
from forethought_bench.tasks.open_research import open_research
from forethought_bench.tasks.synthesis import synthesis

__all__ = [
    "arguments",
    "boundary",
    "claim_recall",
    "definitions",
    "open_research",
    "synthesis",
]
