"""Pinned model version strings and benchmark metadata.

Per the design doc: never use aliases - APIs shift silently behind aliases.
Bump these explicitly and re-run the benchmark when you switch models.

For the Claude Code subprocess judge we DO use aliases (`opus`, `haiku`)
because the CLI resolves them at call time and we record the resolved id
in eval log usage metadata. The aliases below are the API-direct fallbacks.
"""

# API-direct judge models (used when FOREBENCH_USE_API=1).
# IMPORTANT: the model under test must NEVER equal a judge model
# (self-preference bias). The chat app uses claude-sonnet-4-6, so
# any Sonnet-family judge would violate this rule.
JUDGE_CLAUDE = "claude-opus-4-7"
JUDGE_OPENAI = "gpt-4o-2024-08-06"
JUDGE_OPEN_WEIGHT = "deepseek-chat"  # pin to a specific build tag in production

# Extractor model (used by the LLM-based extractor only; the chat-app
# adapter is heuristic and doesn't run an extractor pass).
EXTRACTOR = "claude-haiku-4-5-20251001"

# Benchmark schema + scoring version. Bump when:
# - item schema changes
# - default item set changes (e.g., adding/removing tiers)
# - scorer logic changes in a way that affects historical comparability
#
# Eval logs record this version in Task.metadata so future-you can tell
# whether a regression is real or just a benchmark change.
BENCHMARK_VERSION = "0.3.0"
