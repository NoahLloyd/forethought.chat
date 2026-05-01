"""Thin CLI entrypoint. Real eval runs use Inspect AI's CLI directly."""

from __future__ import annotations

import sys

USAGE = """\
forethought-bench: benchmark suite for an agent grounded in Forethought
Research's corpus, organized as three independent modes.

Run a whole mode's smoke set:

  bash scripts/run_librarian.sh
  bash scripts/run_gate.sh
  bash scripts/run_researcher.sh           # parked

Run a single track via Inspect AI's CLI directly:

  inspect eval forethought_bench/librarian/tasks/claim_recall.py \\
    -T base_url=http://localhost:3000 \\
    -T content_dir=$FORETHOUGHT_CONTENT_DIR

Available tracks:

  Librarian (grounded answerer):
    forethought_bench/librarian/tasks/definitions.py
    forethought_bench/librarian/tasks/claim_recall.py
    forethought_bench/librarian/tasks/arguments.py
    forethought_bench/librarian/tasks/synthesis.py

  Gate (router):
    forethought_bench/gate/tasks/boundary.py

  Researcher (parked):
    forethought_bench/researcher/tasks/open_research.py

See README.md for setup, item curation, and judge configuration.
"""


def main() -> int:
    sys.stdout.write(USAGE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
