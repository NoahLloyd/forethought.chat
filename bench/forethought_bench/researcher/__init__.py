"""Researcher mode: open-domain macrostrategy researcher.

The Researcher takes over for questions that are not answerable from
Forethought's corpus. It is intended to operate over much longer time
budgets (potentially hours per question) and uses fundamentally different
evaluation paradigms (likely pairwise LLM-as-judge / Elo).

Status: parked. The researcher harness does not yet exist; the open_research
track here is preserved as the seed of a future evaluation.

Tracks:
  - open_research : 4-axis rubric on macrostrategy questions Forethought
                    hasn't directly answered.
"""

from forethought_bench.researcher.tasks import open_research

__all__ = ["open_research"]
