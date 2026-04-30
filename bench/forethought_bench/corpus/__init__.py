"""Corpus loader and retrieval interface.

For V1: file-based loader that consumes forethoughtchat-style data/content/.
The Corpus interface is designed so a pgvector + tsvector hybrid backend
(per the design doc) can drop in without changing scoring code.
"""

from forethought_bench.corpus.loader import (
    Corpus,
    CorpusRecord,
    PassageMatch,
)

__all__ = ["Corpus", "CorpusRecord", "PassageMatch"]
