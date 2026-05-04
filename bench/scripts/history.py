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
import re
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


_TRACK_COLORS = {
    "definitions":   "#1f77b4",
    "claim_recall":  "#ff7f0e",
    "arguments":     "#2ca02c",
    "synthesis":     "#d62728",
    "boundary":      "#7f7f7f",
    "gate":          "#7f7f7f",
    "open_research": "#9467bd",
}


def _score_color(v: float) -> str:
    """Heatmap green→yellow→red palette (matches report.html intuition)."""
    if v >= 0.80: return "#bce4c1"
    if v >= 0.70: return "#dcefb4"
    if v >= 0.60: return "#f9eba7"
    if v >= 0.45: return "#f4ca7f"
    return "#e89c87"


_TRACK_DESCRIPTIONS = {
    "definitions": (
        "Tests exact recall of domain-specific terms defined in the corpus. "
        "The agent must define the term accurately and cite the right source passage. "
        "Composite = 0.6 verbal_match + 0.2 citation_faithfulness + 0.2 answer_support."
    ),
    "claim_recall": (
        "Tests precise recall of specific factual claims — numeric values or categorical facts — "
        "from corpus sources, including preserving hedging language like 'roughly' or 'approximately'. "
        "Composite = 0.5 correctness + 0.2 hedge_preservation + 0.15 citation_faithfulness + 0.15 answer_support."
    ),
    "arguments": (
        "Tests reconstruction of structured arguments from corpus texts: the agent must identify "
        "all required logical elements of an argument and cite the source. "
        "Composite = 0.6 elements_rubric + 0.2 citation_faithfulness + 0.2 answer_support."
    ),
    "synthesis": (
        "Tests synthesis across multiple sources: the agent must draw on several corpus documents, "
        "recall all expected citations, integrate them coherently, and cover required elements. "
        "Composite = 0.25 citation_recall + 0.25 elements_rubric + 0.20 integration + "
        "0.15 citation_faithfulness + 0.15 answer_support."
    ),
    "open_research": (
        "Open-domain macrostrategy research (parked — harness not yet built). "
        "Composite = 0.7 four-axis rubric + 0.3 citation_faithfulness."
    ),
}

_METRIC_TIPS = {
    "n": "Number of items scored in this run.",
    "Latest": "Composite score from the most recent run (n-weighted mean across items in this track).",
    "Previous": "Composite score from the run immediately before the latest.",
    "Delta": (
        "Change from the previous run. Green ↑ = improved by >0.005, "
        "red ↓ = regressed by >0.005, grey → = effectively flat."
    ),
    "Best ever": "Highest composite this track has ever achieved across all runs on record.",
    "Valid cite%": (
        "Citation faithfulness: fraction of citations where the cited passage was (a) found in "
        "the corpus and (b) actually supported the claim it was attached to. "
        "Low means the agent is hallucinating sources or misattributing quotes."
    ),
    "Ans sup": (
        "Answer support: mean score (0–1) measuring how well the answer's claims are "
        "backed by the cited evidence. Low means the agent is asserting things not "
        "covered by the sources it cites."
    ),
}


def cmd_dashboard(runs: list[RunSummary], out_path: str) -> None:
    """Single-page HTML dashboard: improvement banner, KPIs, chart, track table, heatmap."""
    import datetime as _dt

    if not runs:
        print("no runs to render", file=sys.stderr)
        return

    latest = runs[-1]
    prev = runs[-2] if len(runs) >= 2 else None
    versions = sorted({r.benchmark_version for r in runs})

    # ── Active tracks (skip retired boundary/gate) ───────────────────────────
    active_tracks = [
        t for t in TRACK_ORDER
        if any(t in r.tracks for r in runs) and t not in {"boundary", "gate"}
    ]

    # ── Per-track statistics ─────────────────────────────────────────────────
    track_data: dict[str, dict] = {}
    for t in active_tracks:
        all_scores = [
            r.tracks[t].composite_mean for r in runs
            if t in r.tracks and r.tracks[t].composite_mean == r.tracks[t].composite_mean
        ]
        if not all_scores:
            continue
        l_score = latest.tracks[t].composite_mean if t in latest.tracks else None
        p_score = prev.tracks[t].composite_mean if prev and t in prev.tracks else None
        b_score = max(all_scores)
        delta = (l_score - p_score) if (l_score is not None and p_score is not None) else None
        track_data[t] = {
            "latest": l_score, "prev": p_score, "best": b_score, "delta": delta,
            "is_best": l_score is not None and abs(l_score - b_score) < 1e-9,
            "n": latest.tracks[t].n if t in latest.tracks else 0,
            "valid_rate": latest.tracks[t].valid_rate if t in latest.tracks else None,
            "ans_sup_mean": latest.tracks[t].ans_sup_mean if t in latest.tracks else None,
        }

    # ── Per-item matrix (active tracks only) ─────────────────────────────────
    active_track_set = set(active_tracks)
    matrix: dict[tuple[str, str], dict[str, float]] = {}
    for r in runs:
        for t, ts in r.tracks.items():
            if t not in active_track_set:
                continue
            for iid, v in ts.items:
                matrix.setdefault((t, iid), {})[r.name] = v
    item_best: dict[tuple[str, str], float] = {
        k: max(vs.values()) for k, vs in matrix.items()
    }

    # ── Overall statistics ────────────────────────────────────────────────────
    overall_latest = latest.overall_composite
    overall_prev = prev.overall_composite if prev else None
    overall_best = max(
        r.overall_composite for r in runs
        if r.overall_composite == r.overall_composite
    )
    overall_delta = (overall_latest - overall_prev) if overall_prev is not None else None

    # ── Improvement banner ────────────────────────────────────────────────────
    if overall_delta is not None:
        if overall_delta > 0.001:
            banner_cls, banner_icon = "improve", "↑"
        elif overall_delta < -0.001:
            banner_cls, banner_icon = "regress", "↓"
        else:
            banner_cls, banner_icon = "flat", "→"
        track_deltas = []
        for t, td in track_data.items():
            if td["delta"] is not None and abs(td["delta"]) >= 0.005:
                arrow = "↑" if td["delta"] > 0 else "↓"
                track_deltas.append(f"{t} {td['delta']:+.3f}{arrow}")
        detail_span = (
            f"<span class='banner-detail'>({' · '.join(track_deltas)})</span>"
            if track_deltas else ""
        )
        banner_html = (
            f"<div class='banner banner-{banner_cls}'>"
            f"<span class='banner-icon'>{banner_icon}</span>"
            f"<span class='banner-msg'>Overall {overall_delta:+.3f} vs previous run</span>"
            f"{detail_span}</div>"
        )
    else:
        banner_html = ""

    # ── SVG chart ─────────────────────────────────────────────────────────────
    cw, ch = 880, 310
    pl, pr, pt, pb = 50, 24, 28, 54
    pw, ph = cw - pl - pr, ch - pt - pb
    n_pts = max(1, len(runs) - 1)

    def cx(i: int) -> float:
        return pl + (i / n_pts) * pw if len(runs) > 1 else pl + pw / 2

    def cy(v: float) -> float:
        return pt + ph - max(0.0, min(1.0, v)) * ph

    svg: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{cw}" height="{ch}" '
        f'viewBox="0 0 {cw} {ch}" '
        f'font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="11">',
        '<defs><style>'
        '.gl{stroke:#e6e0d4;stroke-dasharray:3 3}'
        '.ax{stroke:#c0b8ae}'
        '.lbl{fill:#8a7f76}'
        '</style></defs>',
    ]
    for gv in (0.25, 0.50, 0.75, 1.00):
        gy = cy(gv)
        svg.append(f'<line class="gl" x1="{pl}" y1="{gy:.1f}" x2="{cw-pr}" y2="{gy:.1f}"/>')
        svg.append(f'<text class="lbl" x="{pl-6:.1f}" y="{gy+4:.1f}" text-anchor="end">{gv:.2f}</text>')
    svg.append(f'<line class="ax" x1="{pl}" y1="{pt}" x2="{pl}" y2="{ch-pb}"/>')
    svg.append(f'<line class="ax" x1="{pl}" y1="{ch-pb:.1f}" x2="{cw-pr}" y2="{ch-pb:.1f}"/>')

    # X-axis tick labels (abbreviated, rotated)
    step = max(1, len(runs) // 14)
    for i, r in enumerate(runs):
        if i % step == 0 or i == len(runs) - 1:
            xx = cx(i)
            lbl = r.timestamp[5:10] if len(r.timestamp) >= 10 else r.name[-8:]
            svg.append(
                f'<text class="lbl" x="{xx:.1f}" y="{ch-pb+13:.1f}" text-anchor="end" '
                f'transform="rotate(-40,{xx:.1f},{ch-pb+13:.1f})">{lbl}</text>'
            )

    # Benchmark version change markers
    last_bv: str | None = None
    for i, r in enumerate(runs):
        if last_bv is not None and r.benchmark_version != last_bv:
            xx = cx(i)
            svg.append(
                f'<line x1="{xx:.1f}" y1="{pt}" x2="{xx:.1f}" y2="{ch-pb}" '
                f'stroke="#b0a898" stroke-width="1" stroke-dasharray="4 3"/>'
            )
            svg.append(
                f'<text class="lbl" x="{xx+3:.1f}" y="{pt+9}" fill="#b0a898">v{r.benchmark_version}</text>'
            )
        last_bv = r.benchmark_version

    # Per-track polylines + dots with native tooltips
    for t in active_tracks:
        pts_data: list[tuple[float, float, float, str]] = []
        for i, r in enumerate(runs):
            ts = r.tracks.get(t)
            if ts is None or ts.n == 0 or ts.composite_mean != ts.composite_mean:
                continue
            pts_data.append((cx(i), cy(ts.composite_mean), ts.composite_mean, r.name))
        if not pts_data:
            continue
        color = _TRACK_COLORS.get(t, "#666")
        poly = " ".join(f"{xx:.1f},{yy:.1f}" for xx, yy, _, _ in pts_data)
        svg.append(
            f'<polyline points="{poly}" stroke="{color}" stroke-width="2.5" fill="none" '
            f'stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>'
        )
        for xx, yy, sc, rname in pts_data:
            is_lat = rname == latest.name
            r_size = "5.5" if is_lat else "3.5"
            stroke_extra = ' stroke="white" stroke-width="1.5"' if is_lat else ""
            svg.append(
                f'<circle cx="{xx:.1f}" cy="{yy:.1f}" r="{r_size}" fill="{color}"{stroke_extra}>'
                f'<title>{t}: {sc:.3f}\n{rname}</title></circle>'
            )

    # Legend (top-right)
    leg_x, leg_y = cw - pr - 6, pt + 10
    for t in reversed(active_tracks):
        color = _TRACK_COLORS.get(t, "#666")
        svg.append(
            f'<rect x="{leg_x-64}" y="{leg_y-7}" width="12" height="3" fill="{color}"/>'
            f'<text x="{leg_x-48}" y="{leg_y-1}" fill="{color}" font-size="11">{t}</text>'
        )
        leg_y += 15
    svg.append("</svg>")
    chart_svg = "".join(svg)

    # ── Track table ───────────────────────────────────────────────────────────
    def _delta_td(delta: float | None, is_best: bool) -> str:
        best = "<span class='best-badge'>★ new best</span>" if is_best else ""
        if delta is None:
            return f"<td class='num'>—</td><td>{best}</td>"
        if delta > 0.005:
            cls, arrow = "delta-up", "↑"
        elif delta < -0.005:
            cls, arrow = "delta-dn", "↓"
        else:
            cls, arrow = "delta-fl", "→"
        return f"<td class='num {cls}'>{delta:+.3f}&thinsp;{arrow}</td><td>{best}</td>"

    track_rows: list[str] = []
    for t in active_tracks:
        td = track_data.get(t)
        if td is None:
            continue
        l, p, b = td["latest"], td["prev"], td["best"]
        l_cell = (
            f"<td class='num sc' style='background:{_score_color(l)}'>{l:.3f}</td>"
            if l is not None else "<td class='num'>—</td>"
        )
        p_cell = f"<td class='num muted'>{p:.3f}</td>" if p is not None else "<td class='num muted'>—</td>"
        b_cell = f"<td class='num muted'>{b:.3f}</td>"
        vr = f"{td['valid_rate']*100:.1f}%" if td["valid_rate"] is not None else "—"
        ans = f"{td['ans_sup_mean']:.3f}" if td["ans_sup_mean"] is not None else "—"
        desc = _TRACK_DESCRIPTIONS.get(t, "")
        track_rows.append(
            f"<tr>"
            f"<td class='tn'><span class='tip' data-tip='{desc}'>{t}</span></td>"
            f"<td class='num muted'>{td['n']}</td>"
            f"{l_cell}{p_cell}{_delta_td(td['delta'], td['is_best'])}"
            f"{b_cell}<td class='num muted'>{vr}</td><td class='num muted'>{ans}</td></tr>"
        )

    # ── Per-item heatmap ──────────────────────────────────────────────────────
    heat: list[str] = [
        "<table class='heatmap'><thead><tr>",
        "<th>Track</th><th>Item</th>",
    ]
    for r in runs:
        short = r.timestamp[5:10] if len(r.timestamp) >= 10 else r.name[-6:]
        cls = " class='col-lat'" if r.name == latest.name else ""
        heat.append(f"<th{cls} title='{r.name} ({r.timestamp[:19]})'>{short}</th>")
    heat.append("</tr></thead><tbody>")
    for (t, iid) in sorted(matrix.keys()):
        heat.append(f"<tr><td class='ht'>{t}</td><td class='hi'>{iid}</td>")
        for r in runs:
            v = matrix[(t, iid)].get(r.name)
            if v is None:
                heat.append("<td class='hm'></td>")
            else:
                is_pb = abs(v - item_best[(t, iid)]) < 1e-9
                tip = f" title='{r.name}: {v:.3f}" + (" ★ personal best" if is_pb else "") + "'"
                pb_star = "★" if is_pb else ""
                lat_cls = " hlat" if r.name == latest.name else ""
                heat.append(
                    f"<td class='hc{lat_cls}' style='background:{_score_color(v)}'{tip}>"
                    f"{v:.2f}{pb_star}</td>"
                )
        heat.append("</tr>")
    heat.append("</tbody></table>")
    heatmap_html = "".join(heat)

    # ── Run history table (most recent first, cap 25) ─────────────────────────
    hist_rows: list[str] = []
    track_th = "".join(f"<th class='num' title='{_METRIC_TIPS.get(t, t)}'>{t}</th>" for t in active_tracks)
    for r in reversed(runs[-25:]):
        row_cls = " class='row-lat'" if r.name == latest.name else ""
        cells = []
        for t in active_tracks:
            ts = r.tracks.get(t)
            if ts is None:
                cells.append("<td class='num muted'>—</td>")
            else:
                cells.append(
                    f"<td class='num' style='background:{_score_color(ts.composite_mean)}'>"
                    f"{ts.composite_mean:.3f}</td>"
                )
        hist_rows.append(
            f"<tr{row_cls}><td class='ts'>{r.timestamp[:19]}</td>"
            f"<td class='rn'>{r.name}</td>"
            f"<td class='num muted'>{r.benchmark_version}</td>"
            + "".join(cells)
            + f"<td class='num sc' style='background:{_score_color(r.overall_composite)}'>"
              f"<strong>{r.overall_composite:.3f}</strong></td>"
            + f"<td class='num muted'>{r.n_total}</td></tr>"
        )

    # ── KPI delta colour ──────────────────────────────────────────────────────
    if overall_delta is not None and overall_delta > 0.001:
        delta_color = "#16a34a"
    elif overall_delta is not None and overall_delta < -0.001:
        delta_color = "#dc2626"
    else:
        delta_color = "inherit"

    now_utc = _dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    prev_short = (prev.name[:26] + "…") if prev and len(prev.name) > 26 else (prev.name if prev else "—")

    # ── Score legend HTML ─────────────────────────────────────────────────────
    score_legend = (
        "<div class='score-legend'>"
        "<span class='leg-label'>Score scale:</span>"
        "<span class='leg' style='background:#bce4c1' title='Strong'>≥ 0.80</span>"
        "<span class='leg' style='background:#dcefb4' title='Good'>0.70–0.79</span>"
        "<span class='leg' style='background:#f9eba7' title='Middling'>0.60–0.69</span>"
        "<span class='leg' style='background:#f4ca7f' title='Weak'>0.45–0.59</span>"
        "<span class='leg' style='background:#e89c87' title='Poor'>&lt; 0.45</span>"
        "</div>"
    )

    # ── Assemble page ─────────────────────────────────────────────────────────
    page = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>forethought-bench dashboard</title>
<style>
:root {{
  --bg: #fbfaf4;
  --ink: #2f2a26;
  --mu: #7a7068;
  --rule: #e6e0d4;
  --up: #16a34a; --up-bg: #dcfce7; --up-border: #86efac;
  --dn: #dc2626; --dn-bg: #fee2e2; --dn-border: #fca5a5;
  --fl: #92400e; --fl-bg: #fef3c7; --fl-border: #fde68a;
  --card: #fff;
  --indigo: #6366f1;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  max-width: 1360px;
  margin: 0 auto;
  padding: 24px 28px 80px;
}}

/* ── Header ── */
.page-header {{ margin-bottom: 6px; }}
h1 {{ font-size: 24px; font-weight: 800; letter-spacing: -0.4px; }}
.meta {{ color: var(--mu); font-size: 12.5px; margin: 4px 0 0; }}
.meta code {{ background: var(--rule); padding: 1px 5px; border-radius: 3px; font-size: 11.5px; }}

/* ── Tooltip system ── */
.tip {{
  cursor: help;
  border-bottom: 1.5px dotted var(--mu);
  position: relative;
}}
.tip::after {{
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e1b18;
  color: #f5f3ee;
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: 7px;
  width: max-content;
  max-width: 320px;
  white-space: normal;
  z-index: 200;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s;
  box-shadow: 0 4px 16px rgba(0,0,0,.22);
  text-align: left;
}}
.tip:hover::after {{ opacity: 1; }}

/* ── Banner ── */
.banner {{
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 10px;
  margin: 18px 0 20px;
  font-size: 16px;
}}
.banner-improve {{ background: var(--up-bg);  color: var(--up);  border: 1.5px solid var(--up-border); }}
.banner-regress  {{ background: var(--dn-bg);  color: var(--dn);  border: 1.5px solid var(--dn-border); }}
.banner-flat     {{ background: var(--fl-bg);  color: var(--fl);  border: 1.5px solid var(--fl-border); }}
.banner-icon  {{ font-size: 28px; line-height: 1; flex-shrink: 0; }}
.banner-msg   {{ font-weight: 700; font-size: 17px; }}
.banner-detail {{ font-size: 12.5px; font-family: Menlo, Consolas, monospace; opacity: 0.85; }}

/* ── KPI cards ── */
.kpi-row {{ display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }}
.kpi {{
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: 10px;
  padding: 12px 18px;
  min-width: 130px;
}}
.kpi-label {{ font-size: 11px; color: var(--mu); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2px; }}
.kpi-value {{ font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }}
.kpi-sub   {{ font-size: 11.5px; color: var(--mu); margin-top: 1px; }}

/* ── Collapsible sections ── */
.section {{
  margin-top: 20px;
  border: 1px solid var(--rule);
  border-radius: 10px;
  overflow: hidden;
}}
.section summary {{
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 13px 16px;
  cursor: pointer;
  user-select: none;
  background: rgba(0,0,0,.018);
  border-bottom: 1px solid transparent;
  transition: background 0.1s;
  list-style: none;
}}
.section summary::-webkit-details-marker {{ display: none; }}
.section[open] summary {{ border-bottom-color: var(--rule); }}
.section summary:hover {{ background: rgba(0,0,0,.035); }}
.section-toggle {{
  font-size: 10px;
  color: var(--mu);
  width: 16px;
  flex-shrink: 0;
  transition: transform 0.15s;
}}
.section[open] .section-toggle {{ transform: rotate(90deg); }}
.section-title {{
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.1px;
  flex: 1;
}}
.section-hint {{
  font-size: 12px;
  color: var(--mu);
  font-weight: 400;
}}
.section-body {{ padding: 16px; }}
.section-body.no-pad {{ padding: 0; }}

/* ── Regen box ── */
.regen-body {{
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.7;
}}
.regen-body p {{ margin-bottom: 8px; }}
.regen-body p:last-child {{ margin-bottom: 0; }}
.regen-body code {{
  background: #1e1b18;
  color: #e8e3da;
  padding: 8px 14px;
  border-radius: 6px;
  display: block;
  font-family: Menlo, Consolas, monospace;
  font-size: 12.5px;
  margin: 6px 0;
  overflow-x: auto;
  white-space: nowrap;
}}

/* ── Score colour legend ── */
.score-legend {{
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}}
.leg-label {{ color: var(--mu); margin-right: 2px; }}
.leg {{
  padding: 2px 8px;
  border-radius: 4px;
  font-family: Menlo, Consolas, monospace;
  font-size: 11.5px;
  cursor: default;
  border: 1px solid rgba(0,0,0,.08);
}}

/* ── Chart ── */
.chart-scroll {{ overflow-x: auto; }}

/* ── Tables (shared) ── */
table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
th, td {{ text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--rule); vertical-align: middle; }}
th {{ background: rgba(0,0,0,.025); font-size: 11.5px; font-weight: 600; color: var(--mu); cursor: default; }}
th[title] {{ cursor: help; border-bottom: 1.5px dotted var(--mu); }}
td.num {{ text-align: right; font-variant-numeric: tabular-nums; font-family: Menlo, Consolas, monospace; font-size: 12.5px; }}
td.muted {{ color: var(--mu); }}
.sc {{ font-weight: 700; }}
.delta-up {{ color: var(--up);  font-weight: 700; }}
.delta-dn {{ color: var(--dn);  font-weight: 700; }}
.delta-fl {{ color: var(--mu); }}
.best-badge {{
  display: inline-block;
  font-size: 10.5px;
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid #fde047;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 20px;
  vertical-align: middle;
  white-space: nowrap;
}}
.tn {{ font-weight: 700; font-size: 14px; }}

/* ── Heatmap ── */
.heatmap-scroll {{ overflow-x: auto; }}
.heatmap {{ width: auto; min-width: 100%; }}
.heatmap th {{
  writing-mode: vertical-rl;
  text-align: left;
  padding: 8px 3px;
  font-size: 10.5px;
  min-width: 24px;
  white-space: nowrap;
  border-bottom: 1px solid var(--rule);
}}
.heatmap th.col-lat {{ background: #eef2ff; }}
.heatmap td.hc {{
  text-align: center;
  padding: 4px 5px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-family: Menlo, Consolas, monospace;
  white-space: nowrap;
  cursor: default;
}}
.heatmap td.hlat  {{ outline: 2px solid var(--indigo); outline-offset: -2px; }}
.heatmap td.hm    {{ background: repeating-linear-gradient(45deg,#edeae2 0 5px,transparent 5px 10px); }}
.heatmap td.hi    {{ font-family: Menlo, Consolas, monospace; font-size: 11.5px; color: #555; white-space: nowrap; }}
.heatmap td.ht    {{ color: #bbb; font-size: 11px; white-space: nowrap; }}

/* ── History table ── */
.rn  {{ font-family: Menlo, Consolas, monospace; font-size: 11.5px; }}
.ts  {{ font-size: 12.5px; color: var(--mu); }}
.row-lat {{ background: #f4f6ff; }}
.row-lat td {{ font-weight: 600; }}
</style>
</head><body>

<div class="page-header">
  <h1>forethought-bench</h1>
  <p class="meta">
    {len(runs)} runs &middot; bench v{", ".join(versions)} &middot;
    latest: <code>{latest.name}</code> &middot;
    generated: {now_utc}
  </p>
</div>

{banner_html}

<div class="kpi-row">
  <div class="kpi">
    <div class="kpi-label">Latest overall</div>
    <div class="kpi-value">{overall_latest:.3f}</div>
    <div class="kpi-sub">{latest.n_total} items &middot; {latest.mode}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">vs Previous run</div>
    <div class="kpi-value" style="color:{delta_color}">{f"{overall_delta:+.3f}" if overall_delta is not None else "—"}</div>
    <div class="kpi-sub" title="{prev.name if prev else ''}">{prev_short}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Best ever</div>
    <div class="kpi-value">{overall_best:.3f}</div>
    <div class="kpi-sub">across {len(runs)} runs</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Bench version</div>
    <div class="kpi-value" style="font-size:22px">{latest.benchmark_version}</div>
    <div class="kpi-sub">{latest.item_set_hash} (item fingerprint)</div>
  </div>
</div>

<!-- Regeneration info -->
<details class="section">
  <summary>
    <span class="section-toggle">▶</span>
    <span class="section-title">How to regenerate this dashboard</span>
    <span class="section-hint">run after each bench run to keep it current</span>
  </summary>
  <div class="regen-body">
    <p>This file is generated from the <code style="display:inline;background:var(--rule);color:inherit;padding:1px 5px;border-radius:3px;font-size:12px">bench/logs/</code> eval logs — one <code style="display:inline;background:var(--rule);color:inherit;padding:1px 5px;border-radius:3px;font-size:12px">.eval</code> file per track per run. Regenerate any time by running:</p>
    <code>cd bench &amp;&amp; .venv/bin/python scripts/history.py dashboard --out dashboard.html</code>
    <p>To append it automatically after a bench run, add the line above to the end of <code style="display:inline;background:var(--rule);color:inherit;padding:1px 5px;border-radius:3px;font-size:12px">scripts/run_librarian.sh</code>. The dashboard reads all run directories under <code style="display:inline;background:var(--rule);color:inherit;padding:1px 5px;border-radius:3px;font-size:12px">logs/</code> each time, so older history is always included automatically.</p>
  </div>
</details>

<!-- Composite over time chart -->
<details class="section" open>
  <summary>
    <span class="section-toggle">▶</span>
    <span class="section-title">Composite over time</span>
    <span class="section-hint">per-track scores across all {len(runs)} runs — hover dots for score &amp; run name</span>
  </summary>
  <div class="section-body">
    <div class="chart-scroll">{chart_svg}</div>
  </div>
</details>

<!-- Per-track breakdown -->
<details class="section" open>
  <summary>
    <span class="section-toggle">▶</span>
    <span class="section-title">Latest per-track</span>
    <span class="section-hint">scores from the most recent run vs previous and all-time best — hover track names for what each track tests</span>
  </summary>
  <div class="section-body">
    {score_legend}
    <table>
    <thead><tr>
      <th>Track</th>
      <th class="num" title="{_METRIC_TIPS['n']}">n</th>
      <th class="num" title="{_METRIC_TIPS['Latest']}">Latest</th>
      <th class="num" title="{_METRIC_TIPS['Previous']}">Previous</th>
      <th class="num" title="{_METRIC_TIPS['Delta']}">Δ vs prev</th>
      <th></th>
      <th class="num" title="{_METRIC_TIPS['Best ever']}">Best ever</th>
      <th class="num" title="{_METRIC_TIPS['Valid cite%']}">Valid cite%</th>
      <th class="num" title="{_METRIC_TIPS['Ans sup']}">Ans sup</th>
    </tr></thead>
    <tbody>{"".join(track_rows)}</tbody>
    </table>
  </div>
</details>

<!-- Per-item heatmap -->
<details class="section" open>
  <summary>
    <span class="section-toggle">▶</span>
    <span class="section-title">Per-item heatmap</span>
    <span class="section-hint">every item &times; every run — ★ = personal best score, outlined column = latest run, hover cells for exact score</span>
  </summary>
  <div class="section-body no-pad">
    <div class="heatmap-scroll">{heatmap_html}</div>
  </div>
</details>

<!-- Run history -->
<details class="section">
  <summary>
    <span class="section-toggle">▶</span>
    <span class="section-title">Run history</span>
    <span class="section-hint">most recent {min(25, len(runs))} of {len(runs)} runs, latest highlighted</span>
  </summary>
  <div class="section-body no-pad">
    <table>
    <thead><tr>
      <th>Timestamp</th><th>Run name</th><th class="num">v</th>
      {track_th}
      <th class="num" title="n-weighted composite across all tracks in this run">Overall</th>
      <th class="num" title="Number of items scored">n</th>
    </tr></thead>
    <tbody>{"".join(hist_rows)}</tbody>
    </table>
  </div>
</details>

</body></html>
"""
    Path(out_path).write_text(page)
    print(f"wrote {out_path}")


def cmd_noisy_items(runs: list[RunSummary], min_runs: int, version: str | None) -> None:
    """Per-item σ ranking. Filters to items with ≥`min_runs` data points so a
    single bad run doesn't define the noisy list. Pass `version` to restrict
    to runs at one BENCHMARK_VERSION (avoids mixing pre/post-iteration noise
    with real benchmark-shape changes).
    """
    matrix: dict[tuple[str, str], list[float]] = defaultdict(list)
    for r in runs:
        if version and r.benchmark_version != version:
            continue
        for t, ts in r.tracks.items():
            for iid, v in ts.items:
                matrix[(t, iid)].append(v)
    rows: list[tuple[float, str, str, float, float, int]] = []
    for (t, iid), scores in matrix.items():
        if len(scores) < min_runs:
            continue
        m = mean(scores)
        if len(scores) >= 2:
            var = sum((s - m) ** 2 for s in scores) / (len(scores) - 1)
            sd = var ** 0.5
        else:
            sd = 0.0
        rng = max(scores) - min(scores)
        rows.append((sd, t, iid, m, rng, len(scores)))
    rows.sort(reverse=True)
    print(f"# Noisiest items (σ across ≥{min_runs} runs)\n")
    print(f"| Track | Item | n | mean | σ | range |")
    print(f"|---|---|---|---|---|---|")
    for sd, track, iid, m, rng, n in rows:
        flag = "⚠" if sd > 0.05 else ""
        print(f"| {track} | {iid} | {n} | {m:.3f} | {sd:.3f} {flag} | {rng:.3f} |")


def cmd_variance(runs: list[RunSummary], run_names: list[str]) -> None:
    """Per-track σ across N≥3 runs with the same item set. Validation: σ ≤
    0.025 means a 0.05 composite shift is detectable at p<0.05 (1.96σ).
    """
    if len(run_names) < 2:
        print("variance needs at least 2 runs", file=sys.stderr)
        sys.exit(2)
    selected: list[RunSummary] = []
    for n in run_names:
        r = find_run(n, runs)
        if r is None:
            print(f"run not found: {n}", file=sys.stderr)
            sys.exit(2)
        selected.append(r)
    print(f"# Variance across {len(selected)} runs\n")
    for r in selected:
        print(f"- `{r.name}` (v{r.benchmark_version}, items={r.item_set_hash})")
    print()
    versions = {r.benchmark_version for r in selected}
    item_sets = {r.item_set_hash for r in selected}
    if len(versions) > 1 or len(item_sets) > 1:
        print(
            f"> ⚠ runs span {len(versions)} version(s) and {len(item_sets)} item "
            "set(s). Variance estimate mixes scoring shape with run-to-run noise.\n"
        )
    print("| Track | n_runs | mean | σ | range | σ≤0.025? |")
    print("|---|---|---|---|---|---|")
    track_names = sorted({t for r in selected for t in r.tracks})
    for t in track_names:
        composites = [r.tracks[t].composite_mean for r in selected if t in r.tracks]
        composites = [c for c in composites if c == c]  # drop NaN
        if len(composites) < 2:
            continue
        m = mean(composites)
        var = sum((c - m) ** 2 for c in composites) / (len(composites) - 1)
        sigma = var ** 0.5
        rng = f"[{min(composites):.3f}, {max(composites):.3f}]"
        print(f"| {t} | {len(composites)} | {m:.3f} | {sigma:.3f} | {rng} | "
              f"{'✓' if sigma <= 0.025 else '⚠'} |")


def cmd_heatmap(runs: list[RunSummary], track: str | None = None) -> None:
    """Markdown heatmap: rows=items, cols=runs (chronological)."""
    # Collect scores keyed by (track, item_id) → {run_name: score}.
    matrix: dict[tuple[str, str], dict[str, float]] = {}
    run_names: list[str] = []
    run_versions: dict[str, str] = {}
    for r in runs:
        run_names.append(r.name)
        run_versions[r.name] = r.benchmark_version
        for t, ts in r.tracks.items():
            if track and t != track:
                continue
            for iid, v in ts.items:
                matrix.setdefault((t, iid), {})[r.name] = v
    if not matrix:
        print("no scored items found", file=sys.stderr)
        return
    # Compact run labels: timestamp + first 4 chars of run name
    short = {n: f"{n[-15:]}" for n in run_names}

    print("# Item heatmap (rows=items, cols=runs sorted chronologically)\n")
    if track:
        print(f"Filtered to track=`{track}`.\n")
    header = ["Track", "Item"] + [short[n] for n in run_names]
    print("| " + " | ".join(header) + " |")
    print("|" + "|".join(["---"] * len(header)) + "|")
    for (t, iid) in sorted(matrix):
        cells = []
        for n in run_names:
            v = matrix[(t, iid)].get(n)
            cells.append(f"{v:.2f}" if v is not None else "")
        print(f"| {t} | {iid} | " + " | ".join(cells) + " |")
    print()
    print("Versions: " + ", ".join(f"`{n[-15:]}`=v{run_versions[n]}" for n in run_names))


_RUN_NUM_RE = re.compile(r'^r(\d+)_')


def cmd_next_name(runs: list[RunSummary], description: str) -> None:
    """Print the next r{nn}_description directory name to use for a new run."""
    max_n = 0
    for r in runs:
        m = _RUN_NUM_RE.match(r.name)
        if m:
            max_n = max(max_n, int(m.group(1)))
    slug = re.sub(r'[^a-z0-9]+', '_', description.lower()).strip('_')
    print(f"r{max_n + 1:02d}_{slug}")


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
    p_heatmap = sub.add_parser("heatmap", help="per-item × per-run grid")
    p_heatmap.add_argument("--track", default=None, help="filter to one track")
    p_var = sub.add_parser("variance", help="σ per track across N runs")
    p_var.add_argument("runs", nargs="+", help="run names / suffixes")
    p_dash = sub.add_parser("dashboard", help="one-page HTML history (KPIs + chart + heatmap)")
    p_dash.add_argument("--out", default="history.html", help="output HTML path (default history.html)")
    p_noisy = sub.add_parser("noisy-items", help="rank items by σ across runs")
    p_noisy.add_argument("--min-runs", type=int, default=2,
                         help="minimum runs an item must appear in (default 2)")
    p_noisy.add_argument("--version", default=None,
                         help="only consider runs at this BENCHMARK_VERSION (e.g. 0.3.0)")
    p_next = sub.add_parser("next-name", help="print the next r{nn}_description directory name")
    p_next.add_argument("description", help="short description of the change, e.g. 'fix judge temperature'")
    args = parser.parse_args()

    runs = discover_runs(args.logs_dir)
    if args.cmd == "next-name":
        cmd_next_name(runs, args.description)
        return 0
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
    elif args.cmd == "heatmap":
        cmd_heatmap(runs, track=args.track)
    elif args.cmd == "variance":
        cmd_variance(runs, args.runs)
    elif args.cmd == "dashboard":
        cmd_dashboard(runs, args.out)
    elif args.cmd == "noisy-items":
        cmd_noisy_items(runs, args.min_runs, args.version)
    return 0


if __name__ == "__main__":
    sys.exit(main())
