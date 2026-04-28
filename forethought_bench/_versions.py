"""Pinned model version strings and benchmark metadata.

Per the design doc: never use aliases - APIs shift silently behind aliases.
Bump these explicitly and re-run the benchmark when you switch models.
"""

# Judge models - used by scorers and the citation-faithfulness pipeline.
# Multiple judges form an ensemble for rubric items.
# IMPORTANT: the model under test must NEVER equal a judge (self-preference bias).
JUDGE_CLAUDE = "claude-sonnet-4-6"
JUDGE_OPENAI = "gpt-4o-2024-08-06"
JUDGE_OPEN_WEIGHT = "deepseek-chat"  # pin to a specific build tag in production

# Extractor model - parses prose agent output into AgentOutput schema for
# agents that don't natively emit structured output.
EXTRACTOR = "claude-haiku-4-5-20251001"

# Benchmark schema version - bump when item schema or scoring logic changes.
BENCHMARK_VERSION = "0.1.0"
