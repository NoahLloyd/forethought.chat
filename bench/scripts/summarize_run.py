"""Print per-track composite means and per-item explanations for an eval log dir.

Usage:
  .venv/bin/python scripts/summarize_run.py logs/final_run/
"""

from __future__ import annotations

import sys
from glob import glob
from statistics import mean

from inspect_ai.log import read_eval_log


def main(log_dir: str) -> int:
    paths = sorted(glob(f"{log_dir.rstrip('/')}/*.eval"))
    if not paths:
        print(f"No .eval files in {log_dir}")
        return 1

    print(f"=== {log_dir} ===\n")
    for p in paths:
        log = read_eval_log(p)
        track = (log.eval.metadata or {}).get("track", "?") if log.eval else "?"
        composites: list[float] = []
        rows: list[tuple[str, float, str]] = []
        for sample in log.samples or []:
            score = next(iter(sample.scores.values())) if sample.scores else None
            if not score or score.value is None:
                continue
            try:
                v = float(score.value)
            except (TypeError, ValueError):
                continue
            composites.append(v)
            rows.append((str(sample.id), v, score.explanation or ""))
        avg = mean(composites) if composites else float("nan")
        print(f"--- track={track}  n={len(composites)}  composite_mean={avg:.3f}")
        for sid, v, expl in rows:
            print(f"  {sid:42s} {v:.2f}  | {expl[:120]}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "logs/final_run"))
