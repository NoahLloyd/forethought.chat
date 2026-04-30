"""Thin CLI entrypoint. Real eval runs use Inspect AI's CLI directly."""

from __future__ import annotations

import sys

USAGE = """\
forethought-bench: benchmark for agents grounded in Forethought Research's corpus.

Run an eval with Inspect AI's CLI directly:

  inspect eval forethought_bench.tasks.claim_recall \\
    -T base_url=http://localhost:3000 \\
    -T content_dir=$FORETHOUGHT_CONTENT_DIR

Available tracks:
  forethought_bench.tasks.claim_recall    (V1, fully wired)
  forethought_bench.tasks.definitions     (stub)
  forethought_bench.tasks.arguments       (stub)
  forethought_bench.tasks.synthesis       (stub)
  forethought_bench.tasks.boundary        (stub)
  forethought_bench.tasks.open_research   (stub)

See README.md for setup, item curation, and judge configuration.
"""


def main() -> int:
    sys.stdout.write(USAGE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
