#!/usr/bin/env bash
# Run the Gate smoke bench (boundary detection: ground/refuse/split/caveat
# across negative-coverage / citation-bait / mixed / outdated subtypes).
#
# The Gate is the routing decision: is this question answerable from
# Forethought's corpus? Today the only "yes" path is the Librarian; the
# "no" path is refusal until the Researcher mode exists.
#
# Usage: bash scripts/run_gate.sh [base_url]
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
LOG_DIR="${LOG_DIR:-logs/gate_$(date +%Y%m%d-%H%M%S)}"
MAX_SAMPLES="${MAX_SAMPLES:-8}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/.." && pwd)"

if [ -z "${FORETHOUGHT_CONTENT_DIR:-}" ]; then
  CANDIDATE="$REPO_ROOT/web/data/content"
  if [ -d "$CANDIDATE" ]; then
    export FORETHOUGHT_CONTENT_DIR="$CANDIDATE"
  else
    echo "FORETHOUGHT_CONTENT_DIR not set and $CANDIDATE missing." >&2
    echo "Run from monorepo root or set FORETHOUGHT_CONTENT_DIR explicitly." >&2
    exit 1
  fi
fi

cd "$BENCH_DIR"

mkdir -p "$LOG_DIR"
echo "Mode        -> gate"
echo "Bench dir   -> $BENCH_DIR"
echo "Logs        -> $LOG_DIR"
echo "Base URL    -> $BASE_URL"
echo "Max samples -> $MAX_SAMPLES"
echo "Corpus      -> $FORETHOUGHT_CONTENT_DIR"

TRACKS=(
  forethought_bench/gate/tasks/boundary.py
)

.venv/bin/inspect eval "${TRACKS[@]}" \
  -T "base_url=$BASE_URL" \
  --max-samples="$MAX_SAMPLES" \
  --log-dir "$LOG_DIR" \
  --model anthropic/claude-haiku-4-5

echo
echo "Rendering aggregate report from $LOG_DIR ..."
.venv/bin/python scripts/render_report.py --aggregate "$LOG_DIR"

echo
echo "Done. Logs at $LOG_DIR; aggregate report at report.md / report.html."
