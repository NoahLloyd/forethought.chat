"""File-based corpus loader and URL-keyed passage lookup.

Consumes the JSON records produced by forethoughtchat's `pnpm scrape` step
(one file per page under data/content/). Used by the citation-faithfulness
pipeline to verify agent citations.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field
from rapidfuzz import fuzz


class CorpusRecord(BaseModel):
    """One canonical record per Forethought page.

    Mirrors the forethoughtchat data/content/{category}__{slug}.json schema.
    Authors are stored as the source emits them (list of objects with name,
    slug, role); use `author_names` for the flat string list.
    """

    url: str
    category: str = ""
    slug: str = ""
    title: str
    description: str | None = None
    authors: list[dict[str, Any]] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    publishedAt: str | None = None
    body: str = ""  # markdown
    text: str = ""  # stripped

    @property
    def author_names(self) -> list[str]:
        names: list[str] = []
        for a in self.authors:
            n = a.get("name")
            if isinstance(n, str):
                names.append(n)
        return names


class PassageMatch(BaseModel):
    """Result of locating a passage in a record."""

    record_url: str
    record_title: str
    score: float  # [0, 1]
    matched_excerpt: str  # substring from source that best matches the query


class Corpus:
    """In-memory corpus over the Forethought scrape output.

    The interface (records, by_url, find_passage) is intentionally minimal so
    a pgvector-backed implementation can be a drop-in replacement.
    """

    def __init__(self, records: list[CorpusRecord]) -> None:
        self._records = records
        self._by_url = {r.url: r for r in records}

    @classmethod
    def from_directory(
        cls, content_dir: Path | str, *, verbose: bool = False
    ) -> Corpus:
        """Load every JSON record from a forethoughtchat content directory.

        Skips files starting with `_` (manifest/aggregate files). When
        `verbose` is true, parse failures are written to stderr; otherwise
        they're silent. Failures should be rare; an unexpected drop usually
        means the upstream scrape schema changed.
        """
        path = Path(content_dir)
        if not path.is_dir():
            raise FileNotFoundError(f"Corpus directory not found: {path}")

        records: list[CorpusRecord] = []
        for jf in sorted(path.glob("*.json")):
            if jf.name.startswith("_"):
                continue
            try:
                data = json.loads(jf.read_text())
            except json.JSONDecodeError as e:
                if verbose:
                    print(f"[corpus] skip {jf.name}: invalid JSON: {e}", file=sys.stderr)
                continue
            allowed = {k: v for k, v in data.items() if k in CorpusRecord.model_fields}
            try:
                records.append(CorpusRecord.model_validate(allowed))
            except Exception as e:
                if verbose:
                    print(f"[corpus] skip {jf.name}: {e}", file=sys.stderr)
                continue
        return cls(records)

    @property
    def records(self) -> list[CorpusRecord]:
        return self._records

    def __len__(self) -> int:
        return len(self._records)

    def by_url(self, url: str) -> CorpusRecord | None:
        return self._by_url.get(url) or self._by_url.get(_canonicalize_url(url))

    def find_passage(
        self, url: str, passage: str, threshold: float = 0.80
    ) -> PassageMatch | None:
        """Locate `passage` within the record at `url`.

        Returns the best fuzzy match if its similarity score >= threshold.
        Score is rapidfuzz.partial_ratio normalized to [0, 1].
        """
        record = self.by_url(url)
        if record is None:
            return None
        return self._locate_in_record(record, passage, threshold)

    def find_passage_anywhere(
        self, passage: str, threshold: float = 0.85
    ) -> PassageMatch | None:
        """Locate `passage` anywhere in the corpus.

        Used to detect citations that quote a real Forethought passage but
        attribute it to the wrong URL. Linear scan; replace with a vector
        index for production scale.
        """
        best: PassageMatch | None = None
        for record in self._records:
            m = self._locate_in_record(record, passage, threshold)
            if m is not None and (best is None or m.score > best.score):
                best = m
        return best

    @staticmethod
    def _locate_in_record(
        record: CorpusRecord, passage: str, threshold: float
    ) -> PassageMatch | None:
        p = passage.strip()
        if not p:
            return None
        # Try both the stripped text and the raw markdown body. Chunks
        # produced by the indexer keep markdown link syntax (e.g. `[name](url)`),
        # which `record.text` strips. A passage built from chunk text will
        # fuzzy-match the body but score below threshold against the stripped
        # text. Picking the higher score across both candidates keeps citation
        # grading robust to that normalization mismatch.
        candidates = [record.text, record.body]
        best: PassageMatch | None = None
        for haystack in candidates:
            if not haystack:
                continue
            if p in haystack:
                idx = haystack.index(p)
                return PassageMatch(
                    record_url=record.url,
                    record_title=record.title,
                    score=1.0,
                    matched_excerpt=haystack[idx : idx + len(p)],
                )
            score = fuzz.partial_ratio(p, haystack) / 100.0
            if score < threshold:
                continue
            try:
                align = fuzz.partial_ratio_alignment(p, haystack)
                excerpt = haystack[align.dest_start : align.dest_end]
            except Exception:
                excerpt = haystack[: min(len(haystack), max(len(p) * 2, 200))]
            candidate = PassageMatch(
                record_url=record.url,
                record_title=record.title,
                score=score,
                matched_excerpt=excerpt,
            )
            if best is None or candidate.score > best.score:
                best = candidate
        return best


def _canonicalize_url(url: str) -> str:
    """Trim trailing slashes / fragments so URL lookups are forgiving."""
    u = url.strip().rstrip("/")
    if "#" in u:
        u = u.split("#", 1)[0].rstrip("/")
    return u
