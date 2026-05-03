"""Dump one full sample (item, output, citation_checks) to stdout.

Usage:
  .venv/bin/python scripts/dump_one_sample.py logs/final_run/<file>.eval [item_id]
"""

from __future__ import annotations

import json
import sys

from inspect_ai.log import read_eval_log


def main(log_path: str, item_id: str | None = None) -> int:
    log = read_eval_log(log_path)
    samples = log.samples or []
    if not samples:
        print("no samples")
        return 1
    if item_id:
        match = [s for s in samples if str(s.id) == item_id]
        if not match:
            print(f"no sample with id={item_id}; available: {[str(s.id) for s in samples]}")
            return 1
        sample = match[0]
    else:
        sample = samples[0]
    score = next(iter(sample.scores.values())) if sample.scores else None
    md = score.metadata if score else {}
    item = (sample.metadata or {}).get("item", {})
    output = (sample.metadata or {}).get("agent_output", {})
    print("=== ITEM ===")
    print(json.dumps(item, indent=2)[:3000])
    print("\n=== AGENT OUTPUT (first 4000 chars) ===")
    answer = output.get("final_answer", "")
    print(answer[:4000])
    print(f"\n  [{len(output.get('citations', []))} citations]")
    print("\n=== CITATION CHECKS ===")
    for c in md.get("citation_checks", [])[:20]:
        print(f"  idx={c['citation_index']} {c['verdict']:25s} match={c.get('passage_match_score')}")
        print(f"    claim: {(c.get('parsed_claim') or '')[:200]}")
        print(f"    rationale: {(c.get('support_rationale') or '')[:200]}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
