"""One-off: enumerate citation_check verdict distributions across a log dir.

Usage:
  .venv/bin/python scripts/inspect_failure_modes.py logs/final_run/
"""

from __future__ import annotations

import sys
from collections import Counter
from glob import glob

from inspect_ai.log import read_eval_log


def main(log_dir: str) -> int:
    paths = sorted(glob(f"{log_dir.rstrip('/')}/*.eval"))
    if not paths:
        print(f"No .eval files in {log_dir}")
        return 1

    overall: Counter[str] = Counter()
    for p in paths:
        log = read_eval_log(p)
        track = (log.eval.metadata or {}).get("track", "?") if log.eval else "?"
        local: Counter[str] = Counter()
        n_items = 0
        n_citations = 0
        n_zero_valid = 0
        for sample in log.samples or []:
            n_items += 1
            score = next(iter(sample.scores.values())) if sample.scores else None
            if not score:
                continue
            md = score.metadata or {}
            cf = md.get("citation_faithfulness") or {}
            if cf.get("n", 0) > 0 and cf.get("valid", 0) == 0:
                n_zero_valid += 1
            for c in md.get("citation_checks") or []:
                v = c.get("verdict") or "missing"
                local[v] += 1
                overall[v] += 1
                n_citations += 1
        valid = local.get("valid", 0)
        fab = local.get("fabricated", 0)
        unsup = local.get("real_but_unsupportive", 0)
        partial = local.get("partial", 0)
        denom = max(n_citations, 1)
        print(
            f"{track:14s} items={n_items:2d}  total_cit={n_citations:3d}  "
            f"valid={valid:3d}({valid/denom:.0%})  fab={fab:3d}({fab/denom:.0%})  "
            f"unsup={unsup:3d}({unsup/denom:.0%})  partial={partial:3d}({partial/denom:.0%})  "
            f"items_with_zero_valid={n_zero_valid}"
        )
    if overall:
        total = sum(overall.values())
        print()
        print("OVERALL:")
        for k, v in overall.most_common():
            print(f"  {k:25s} {v:4d}  ({v/total:.0%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "logs/final_run"))
