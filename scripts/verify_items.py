"""Sanity-check items against the local corpus.

For each item, checks that:
  1. The item parses to the Item schema.
  2. The expected_citation.url is present in the corpus.
  3. The source_passage fuzzy-matches inside that document.

Usage:
  python scripts/verify_items.py --track claim_recall
  FORETHOUGHT_CONTENT_DIR=/path/to/data/content python scripts/verify_items.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from forethought_bench.corpus import Corpus
from forethought_bench.schema import Item, TrackName
from forethought_bench.tasks._common import items_root, resolve_content_dir


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--track",
        default=None,
        choices=[t.value for t in TrackName],
        help="Verify only one track's items (default: all tracks).",
    )
    parser.add_argument(
        "--content-dir",
        default=None,
        help="Forethought content directory (overrides FORETHOUGHT_CONTENT_DIR).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.65,
        help="Fuzzy match threshold for source_passage in [0,1].",
    )
    args = parser.parse_args()

    content_dir = resolve_content_dir(args.content_dir)
    corpus = Corpus.from_directory(content_dir)
    print(f"Loaded {len(corpus)} corpus records from {content_dir}")

    tracks = [TrackName(args.track)] if args.track else list(TrackName)
    failures: list[tuple[str, str]] = []
    n_checked = 0

    for track in tracks:
        track_dir = items_root() / track.value
        if not track_dir.is_dir():
            continue
        for jf in sorted(track_dir.glob("*.json")):
            if jf.name.startswith("_"):
                continue
            try:
                item = Item.model_validate(json.loads(jf.read_text()))
            except Exception as e:
                failures.append((jf.name, f"parse failed: {e}"))
                continue
            if item.expected_citation is None or item.source_passage is None:
                continue
            n_checked += 1
            url = item.expected_citation.url
            record = corpus.by_url(url)
            if record is None:
                failures.append((item.id, f"URL not in corpus: {url}"))
                continue
            match = corpus.find_passage(url, item.source_passage, threshold=args.threshold)
            if match is None:
                failures.append(
                    (item.id, f"source_passage not found in {url} (below threshold)")
                )
                continue
            if match.score < 1.0:
                print(f"  ~ {item.id}: fuzzy match score={match.score:.2f}")

    print(f"\nChecked {n_checked} items; {len(failures)} failures.")
    for name, reason in failures:
        print(f"  FAIL {name}: {reason}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
