"""Cross-run history view: list, compare, and visualize bench runs.

Each run is one directory under ``logs/`` containing one ``.eval`` file per
track. We extract per-track composite means, ``benchmark_version``, and a
content fingerprint of the items used so cross-run comparisons can flag
bench-shape changes (item set or scoring formula) vs. real signal moves.

Usage:
  .venv/bin/python scripts/history.py list
      # Markdown table of every run sorted by timestamp.
  .venv/bin/python scripts/history.py compare RUN_A RUN_B
      # Per-track + per-item delta. Warns on benchmark_version mismatch.
  .venv/bin/python scripts/history.py timeline
      # Markdown overview of overall composite over time, grouped by version.
  .venv/bin/python scripts/history.py details RUN
      # Per-track per-item breakdown (citation valid rate, ans_sup, etc).
  .venv/bin/python scripts/history.py item ITEM_ID
      # One item's score across every run that included it.

Why a separate tool from ``summarize_run.py``: this one is about cross-run
diffs and history. ``summarize_run.py`` is for dumping a single run.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from glob import glob
from pathlib import Path
from statistics import mean
from typing import Any

from inspect_ai.log import read_eval_log

DEFAULT_LOGS_DIR = "logs"

# Track display order — matches the librarian composite weighting in the
# notes file ("defs / claim_recall / arguments / synthesis").
TRACK_ORDER = ["definitions", "claim_recall", "arguments", "synthesis", "boundary", "gate", "open_research"]


@dataclass
class TrackSummary:
    track: str
    benchmark_version: str
    n: int
    composite_mean: float
    items: list[tuple[str, float]] = field(default_factory=list)  # (item_id, composite)
    valid_rate: float | None = None  # citation faithfulness valid / n
    fab_rate: float | None = None
    unsup_rate: float | None = None
    ans_sup_mean: float | None = None
    item_metadata: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class RunSummary:
    name: str
    path: Path
    timestamp: str
    benchmark_version: str
    mode: str
    tracks: dict[str, TrackSummary]
    item_set_hash: str  # fingerprint of the item ids included

    @property
    def n_total(self) -> int:
        return sum(t.n for t in self.tracks.values())

    @property
    def overall_composite(self) -> float:
        scored = [t for t in self.tracks.values() if t.n > 0]
        if not scored:
            return float("nan")
        weighted = sum(t.composite_mean * t.n for t in scored)
        n = sum(t.n for t in scored)
        return weighted / n if n else float("nan")


def _safe_float(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _summarize_track(eval_path: Path) -> TrackSummary:
    log = read_eval_log(str(eval_path))
    meta = (log.eval.metadata or {}) if log.eval else {}
    track = str(meta.get("track", "?"))
    bench_v = str(meta.get("benchmark_version", "?"))

    composites: list[float] = []
    items: list[tuple[str, float]] = []
    cit_valid = cit_fab = cit_unsup = cit_total = 0
    ans_sup_scores: list[float] = []
    item_metadata: dict[str, dict[str, Any]] = {}

    for sample in log.samples or []:
        score = next(iter((sample.scores or {}).values()), None)
        if not score or score.value is None:
            continue
        v = _safe_float(score.value)
        if v is None:
            continue
        composites.append(v)
        items.append((str(sample.id), v))
        sm = score.metadata or {}
        item_metadata[str(sample.id)] = sm

        cit = sm.get("citation_faithfulness") or {}
        cit_valid += int(cit.get("valid", 0))
        cit_fab += int(cit.get("fabricated", 0))
        cit_unsup += int(cit.get("unsupportive", 0))
        cit_total += int(cit.get("n", 0))

        ans_sup = sm.get("answer_support") or {}
        ans_sup_score = _safe_float(ans_sup.get("score"))
        if ans_sup_score is not None and ans_sup.get("judge_ran", True):
            ans_sup_scores.append(ans_sup_score)

    return TrackSummary(
        track=track,
        benchmark_version=bench_v,
        n=len(composites),
        composite_mean=mean(composites) if composites else float("nan"),
        items=items,
        valid_rate=cit_valid / cit_total if cit_total else None,
        fab_rate=cit_fab / cit_total if cit_total else None,
        unsup_rate=cit_unsup / cit_total if cit_total else None,
        ans_sup_mean=mean(ans_sup_scores) if ans_sup_scores else None,
        item_metadata=item_metadata,
    )


def _summarize_run(run_dir: Path) -> RunSummary | None:
    eval_files = sorted(run_dir.glob("*.eval"))
    if not eval_files:
        return None
    tracks: dict[str, TrackSummary] = {}
    versions: set[str] = set()
    timestamps: list[str] = []
    modes: set[str] = set()
    item_ids_per_track: dict[str, list[str]] = {}

    for ep in eval_files:
        ts = _summarize_track(ep)
        tracks[ts.track] = ts
        versions.add(ts.benchmark_version)
        item_ids_per_track[ts.track] = [iid for iid, _ in ts.items]
        log = read_eval_log(str(ep))
        if log.eval and log.eval.created:
            timestamps.append(str(log.eval.created))
        if log.eval and log.eval.metadata:
            modes.add(str(log.eval.metadata.get("mode", "?")))

    bench_v = "/".join(sorted(versions)) if versions else "?"
    earliest = min(timestamps) if timestamps else "?"

    fingerprint_payload = json.dumps(item_ids_per_track, sort_keys=True)
    item_hash = hashlib.sha1(fingerprint_payload.encode()).hexdigest()[:8]

    return RunSummary(
        name=run_dir.name,
        path=run_dir,
        timestamp=earliest,
        benchmark_version=bench_v,
        mode="/".join(sorted(modes)) if modes else "?",
        tracks=tracks,
        item_set_hash=item_hash,
    )


def discover_runs(logs_dir: str = DEFAULT_LOGS_DIR) -> list[RunSummary]:
    runs: list[RunSummary] = []
    for child in sorted(Path(logs_dir).iterdir()):
        if not child.is_dir():
            continue
        rs = _summarize_run(child)
        if rs is not None:
            runs.append(rs)
    runs.sort(key=lambda r: r.timestamp)
    return runs


def find_run(query: str, runs: list[RunSummary]) -> RunSummary | None:
    """Resolve `query` to a run. Accepts exact name, suffix, or path."""
    q = query.rstrip("/")
    # Exact name
    for r in runs:
        if r.name == q:
            return r
    # Path match
    qpath = Path(q).resolve()
    for r in runs:
        if r.path.resolve() == qpath:
            return r
    # Suffix or substring
    matches = [r for r in runs if r.name.endswith(q) or q in r.name]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        names = ", ".join(m.name for m in matches[:5])
        print(f"Ambiguous run '{query}'; matches: {names}", file=sys.stderr)
    return None


def _fmt_pct(x: float | None, *, none: str = "  -  ") -> str:
    return f"{x*100:5.1f}%" if x is not None else none


def _fmt_score(x: float, *, width: int = 5) -> str:
    if x != x:  # NaN
        return "  -  "
    return f"{x:>{width}.3f}"


def cmd_list(runs: list[RunSummary]) -> None:
    """Print all runs as a markdown table."""
    print("# Run history\n")
    print(
        "| Timestamp | Run | Mode | Bench | ItemSet | "
        + " | ".join(t for t in TRACK_ORDER)
        + " | Composite | n |"
    )
    print(
        "|---|---|---|---|---|"
        + "|".join(["---"] * len(TRACK_ORDER))
        + "|---|---|"
    )
    last_version: str | None = None
    for r in runs:
        version_marker = ""
        if last_version is not None and r.benchmark_version != last_version:
            version_marker = f" **← v{r.benchmark_version} starts here**"
        last_version = r.benchmark_version
        track_cells = []
        for t in TRACK_ORDER:
            ts = r.tracks.get(t)
            track_cells.append(_fmt_score(ts.composite_mean) if ts else "  -  ")
        print(
            f"| {r.timestamp[:19]} | {r.name}{version_marker} | "
            f"{r.mode} | {r.benchmark_version} | {r.item_set_hash} | "
            + " | ".join(track_cells)
            + f" | {_fmt_score(r.overall_composite)} | {r.n_total} |"
        )

    print("\n*Composite is n-weighted across the per-track means.*")
    print(
        "*ItemSet is a fingerprint of the included item ids; runs with "
        "different fingerprints aren't directly comparable.*"
    )


def cmd_timeline(runs: list[RunSummary]) -> None:
    """Markdown timeline grouped by benchmark_version."""
    print("# Composite over time\n")
    by_version: dict[str, list[RunSummary]] = defaultdict(list)
    for r in runs:
        by_version[r.benchmark_version].append(r)
    print("Versions encountered (sorted by first appearance):\n")
    seen: set[str] = set()
    for r in runs:
        if r.benchmark_version not in seen:
            print(f"- **v{r.benchmark_version}** — first run: `{r.name}` at {r.timestamp[:19]}")
            seen.add(r.benchmark_version)
    print()
    for version in sorted(by_version.keys()):
        section = by_version[version]
        print(f"## v{version} (n_runs={len(section)})\n")
        composites = [r.overall_composite for r in section]
        if composites:
            print(
                f"- composite range: "
                f"min={min(composites):.3f}  max={max(composites):.3f}  "
                f"mean={mean(composites):.3f}\n"
            )
        # ascii sparkline + table of best/worst per track
        print("| Run | composite | "
              + " | ".join(TRACK_ORDER) + " |")
        print("|---|---|" + "|".join(["---"] * len(TRACK_ORDER)) + "|")
        for r in section:
            track_cells = []
            for t in TRACK_ORDER:
                ts = r.tracks.get(t)
                track_cells.append(_fmt_score(ts.composite_mean) if ts else "  -  ")
            print(f"| {r.name} | {_fmt_score(r.overall_composite)} | " + " | ".join(track_cells) + " |")
        print()


def cmd_details(runs: list[RunSummary], run_name: str) -> None:
    r = find_run(run_name, runs)
    if r is None:
        print(f"run not found: {run_name}", file=sys.stderr)
        sys.exit(2)
    print(f"# {r.name}\n")
    print(f"- timestamp: {r.timestamp}")
    print(f"- mode: {r.mode}")
    print(f"- benchmark_version: {r.benchmark_version}")
    print(f"- item_set_hash: {r.item_set_hash}")
    print(f"- overall composite: {_fmt_score(r.overall_composite)} (n={r.n_total})\n")
    for t in TRACK_ORDER:
        ts = r.tracks.get(t)
        if ts is None:
            continue
        print(f"## {t}  n={ts.n}  composite={ts.composite_mean:.3f}  v{ts.benchmark_version}\n")
        if ts.valid_rate is not None:
            print(
                f"- citation: valid={_fmt_pct(ts.valid_rate)}, "
                f"fab={_fmt_pct(ts.fab_rate)}, "
                f"unsup={_fmt_pct(ts.unsup_rate)}"
            )
        if ts.ans_sup_mean is not None:
            print(f"- ans_sup mean: {ts.ans_sup_mean:.3f}")
        print()
        print("| Item | composite |")
        print("|---|---|")
        for iid, v in ts.items:
            print(f"| {iid} | {v:.3f} |")
        print()


def cmd_compare(runs: list[RunSummary], a: str, b: str) -> None:
    ra, rb = find_run(a, runs), find_run(b, runs)
    if ra is None or rb is None:
        if ra is None:
            print(f"run not found: {a}", file=sys.stderr)
        if rb is None:
            print(f"run not found: {b}", file=sys.stderr)
        sys.exit(2)
    print(f"# Compare\n")
    print(f"- A: `{ra.name}` ({ra.timestamp[:19]}, v{ra.benchmark_version}, items={ra.item_set_hash})")
    print(f"- B: `{rb.name}` ({rb.timestamp[:19]}, v{rb.benchmark_version}, items={rb.item_set_hash})\n")
    if ra.benchmark_version != rb.benchmark_version:
        print(
            f"> ⚠ benchmark_version differs (A=`{ra.benchmark_version}` "
            f"B=`{rb.benchmark_version}`). Score deltas may be partially "
            f"due to scorer changes, not agent behaviour.\n"
        )
    if ra.item_set_hash != rb.item_set_hash:
        print(
            f"> ⚠ item_set fingerprint differs (A=`{ra.item_set_hash}` "
            f"B=`{rb.item_set_hash}`). Item-level deltas only valid for the "
            f"intersection of the two sets.\n"
        )

    print("## Track composites\n")
    print("| Track | A | B | Δ | A.valid | B.valid | A.ans_sup | B.ans_sup |")
    print("|---|---|---|---|---|---|---|---|")
    for t in TRACK_ORDER:
        ta, tb = ra.tracks.get(t), rb.tracks.get(t)
        if ta is None and tb is None:
            continue
        ca = ta.composite_mean if ta else float("nan")
        cb = tb.composite_mean if tb else float("nan")
        delta = (cb - ca) if (ta and tb) else float("nan")
        print(
            f"| {t} | {_fmt_score(ca)} | {_fmt_score(cb)} | "
            f"{_fmt_score(delta)} | {_fmt_pct(ta.valid_rate) if ta else '  -  '} | "
            f"{_fmt_pct(tb.valid_rate) if tb else '  -  '} | "
            f"{_fmt_score(ta.ans_sup_mean) if ta and ta.ans_sup_mean is not None else '  -  '} | "
            f"{_fmt_score(tb.ans_sup_mean) if tb and tb.ans_sup_mean is not None else '  -  '} |"
        )
    print()
    print(f"**Overall composite**: A={_fmt_score(ra.overall_composite)}  "
          f"B={_fmt_score(rb.overall_composite)}  "
          f"Δ={_fmt_score(rb.overall_composite - ra.overall_composite)}\n")

    # Per-item deltas
    print("## Per-item deltas (intersection only)\n")
    print("| Track | Item | A | B | Δ |")
    print("|---|---|---|---|---|")
    for t in TRACK_ORDER:
        ta, tb = ra.tracks.get(t), rb.tracks.get(t)
        if ta is None or tb is None:
            continue
        a_items = dict(ta.items)
        b_items = dict(tb.items)
        common = sorted(set(a_items) & set(b_items))
        for iid in common:
            d = b_items[iid] - a_items[iid]
            arrow = "↑" if d > 0.05 else ("↓" if d < -0.05 else " ")
            print(
                f"| {t} | {iid} | {a_items[iid]:.3f} | {b_items[iid]:.3f} | "
                f"{d:+.3f} {arrow} |"
            )


def cmd_item(runs: list[RunSummary], item_id: str) -> None:
    """Show one item's score across every run that included it."""
    print(f"# Item history: {item_id}\n")
    print("| Timestamp | Run | Track | Bench | Score |")
    print("|---|---|---|---|---|")
    for r in runs:
        for ts in r.tracks.values():
            for iid, v in ts.items:
                if iid == item_id:
                    print(
                        f"| {r.timestamp[:19]} | {r.name} | {ts.track} | "
                        f"v{ts.benchmark_version} | {v:.3f} |"
                    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--logs-dir", default=DEFAULT_LOGS_DIR,
        help=f"directory containing run subdirectories (default: {DEFAULT_LOGS_DIR})",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="markdown table of all runs")
    sub.add_parser("timeline", help="composites grouped by version")
    p_details = sub.add_parser("details", help="per-track per-item breakdown of one run")
    p_details.add_argument("run")
    p_compare = sub.add_parser("compare", help="diff two runs")
    p_compare.add_argument("a")
    p_compare.add_argument("b")
    p_item = sub.add_parser("item", help="one item's score across runs")
    p_item.add_argument("item_id")
    args = parser.parse_args()

    runs = discover_runs(args.logs_dir)
    if not runs:
        print(f"no runs found in {args.logs_dir}", file=sys.stderr)
        return 1

    if args.cmd == "list":
        cmd_list(runs)
    elif args.cmd == "timeline":
        cmd_timeline(runs)
    elif args.cmd == "details":
        cmd_details(runs, args.run)
    elif args.cmd == "compare":
        cmd_compare(runs, args.a, args.b)
    elif args.cmd == "item":
        cmd_item(runs, args.item_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
