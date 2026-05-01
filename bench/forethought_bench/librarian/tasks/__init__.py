"""Inspect AI tasks for Librarian mode."""

from forethought_bench.librarian.tasks.arguments import arguments
from forethought_bench.librarian.tasks.claim_recall import claim_recall
from forethought_bench.librarian.tasks.definitions import definitions
from forethought_bench.librarian.tasks.synthesis import synthesis

__all__ = ["arguments", "claim_recall", "definitions", "synthesis"]
