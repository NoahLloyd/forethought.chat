#!/usr/bin/env bash
# Bash wrapper around web/scripts/bench/search.ts.
#
# Used by bench/forethought_bench/agents/claude_cli.py: the Python agent
# spawns `claude -p` with this script as the only allowed Bash tool, and
# passes BENCH_SOURCES_OUT in the env so search.ts can record citations
# for the bench to read after the run completes.
#
# Usage (from claude -p, via Bash tool):
#   bash /path/to/bench/scripts/forethought-search.sh "<query>" [k]
#
# We deliberately keep the surface area tiny: positional args only, no
# flags. The agent's system prompt teaches the model exactly this shape.
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: forethought-search.sh <query> [k]" >&2
  exit 2
fi

QUERY="$1"
K="${2:-6}"

if [ -z "${BENCH_SOURCES_OUT:-}" ]; then
  echo "forethought-search.sh: BENCH_SOURCES_OUT not set" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WEB_DIR="$REPO_ROOT/web"

cd "$WEB_DIR"
exec pnpm --silent exec tsx scripts/bench/search.ts \
  --query "$QUERY" \
  --k "$K" \
  --sources-out "$BENCH_SOURCES_OUT"
