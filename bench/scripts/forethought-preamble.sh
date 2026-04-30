#!/usr/bin/env bash
# Print the chat agent's stable preamble to stdout. Bench-only helper:
# bench/forethought_bench/agents/claude_cli.py invokes this once per
# process to fetch the system prompt that production uses.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WEB_DIR="$REPO_ROOT/web"

cd "$WEB_DIR"
exec pnpm --silent exec tsx scripts/bench/preamble.ts
