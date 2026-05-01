"""Librarian mode: grounded answerer over Forethought's corpus.

The Librarian retrieves from a fixed corpus, cites sources, and refuses
questions outside the collection. Tracks here measure quality *given* the
question is answerable from the corpus:

  - definitions     : framework / concept recall
  - claim_recall    : specific (often numeric) claim recall
  - arguments       : argument reconstruction with required-elements rubric
  - synthesis       : cross-corpus synthesis across >=2 papers

Boundary detection (deciding "is this in-corpus?") is the Gate's job, not
the Librarian's.
"""

from forethought_bench.librarian.tasks import (
    arguments,
    claim_recall,
    definitions,
    synthesis,
)

__all__ = ["arguments", "claim_recall", "definitions", "synthesis"]
