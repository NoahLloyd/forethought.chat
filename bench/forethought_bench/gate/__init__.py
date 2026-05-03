"""Gate mode: routes questions between Librarian (in-corpus) and Researcher
(out-of-corpus). The Gate doesn't answer; its only job is the routing
decision.

Tracks here measure routing quality:
  - gate : did the agent ground / refuse / split / caveat correctly,
           across negative-coverage / citation-bait / mixed / outdated subtypes

The Researcher path doesn't exist yet, so for now an "out-of-corpus"
classification means the system should refuse rather than route to anything.
"""

from forethought_bench.gate.tasks import gate

__all__ = ["gate"]
