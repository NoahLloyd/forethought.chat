"""Render Inspect AI eval logs into human-friendly reports.

Modes:
  scripts/render_report.py                       # latest single log under logs/
  scripts/render_report.py logs/foo.eval         # specific single log
  scripts/render_report.py --aggregate <dir>     # all *.eval files in <dir>
"""

from __future__ import annotations

import argparse
import glob
import html
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from inspect_ai.log import read_eval_log


@dataclass
class TrackView:
    """Aggregated view of one Inspect AI eval log = one track."""

    log_path: str
    track: str
    tier: str
    bench_version: str
    judge: str
    agent: str
    n_items: int
    composite_mean: float
    wall_s: float
    samples: list[Any] = field(default_factory=list)


def _wall_seconds(log: Any) -> float:
    stats = getattr(log, "stats", None)
    if stats is None:
        return 0.0
    started = getattr(stats, "started_at", None)
    completed = getattr(stats, "completed_at", None)
    if started is None or completed is None:
        return 0.0
    try:
        s = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
        c = datetime.fromisoformat(str(completed).replace("Z", "+00:00"))
        return max(0.0, (c - s).total_seconds())
    except Exception:
        return 0.0


def _scalar_score(sample: Any) -> float:
    if not sample.scores:
        return 0.0
    s = next(iter(sample.scores.values()))
    return float(s.value) if isinstance(s.value, int | float) else 0.0


def _track_view(log_path: str) -> TrackView:
    log = read_eval_log(log_path)
    em = (log.eval.metadata or {}) if log.eval else {}
    samples = log.samples or []
    composite_mean = (
        sum(_scalar_score(s) for s in samples) / len(samples) if samples else 0.0
    )
    return TrackView(
        log_path=log_path,
        track=str(em.get("track", "?")),
        tier=str(em.get("tier", "?")),
        bench_version=str(em.get("benchmark_version", "?")),
        judge=str(em.get("judge", "?")),
        agent=str(em.get("agent", "?")),
        n_items=len(samples),
        composite_mean=composite_mean,
        wall_s=_wall_seconds(log),
        samples=list(samples),
    )


def _latest_log() -> str:
    candidates = sorted(glob.glob("logs/*.eval"))
    if not candidates:
        sys.exit("No log files in logs/")
    return candidates[-1]


# --- Single-log renderer -----------------------------------------------------


@dataclass
class ItemView:
    item_id: str
    track: str
    question: str
    target: str
    answer: str
    composite: float
    score_metadata: dict[str, Any]


def _to_item_view(track: str, sample: Any) -> ItemView:
    score = next(iter(sample.scores.values())) if sample.scores else None
    md = (score.metadata or {}) if score else {}
    item_dump = (sample.metadata or {}).get("item", {})
    return ItemView(
        item_id=str(sample.id),
        track=track,
        question=item_dump.get("question") or (
            sample.input if isinstance(sample.input, str) else ""
        ),
        target=str(sample.target) if sample.target else "",
        answer=(sample.output.completion if sample.output else "") or "",
        composite=float(score.value) if score and isinstance(score.value, int | float) else 0.0,
        score_metadata=md,
    )


def _render_track_md(view: TrackView) -> list[str]:
    lines: list[str] = []
    lines.append(f"## Track: `{view.track}`  (tier={view.tier}, n={view.n_items})")
    lines.append(
        f"composite mean: **{view.composite_mean:.3f}** | wall: {view.wall_s:.0f}s | "
        f"agent: `{view.agent}` | judge: `{view.judge}`"
    )
    lines.append("")
    lines.append("| ID | Composite | Highlights |")
    lines.append("|---|---:|---|")
    for s in view.samples:
        v = _to_item_view(view.track, s)
        highlight = _highlight_for(view.track, v.score_metadata)
        lines.append(f"| {v.item_id} | {v.composite:.2f} | {highlight} |")
    lines.append("")
    return lines


def _highlight_for(track: str, md: dict[str, Any]) -> str:
    """One-line failure-mode highlight per track."""
    cf = md.get("citation_faithfulness") or {}
    sup = md.get("answer_support") or {}
    sup_str = (
        f"sup={sup.get('score', 0):.2f}({len(sup.get('unsupported_claims') or [])})"
        if sup
        else ""
    )
    if track == "claim_recall":
        c = md.get("correctness", "?")
        h = md.get("hedge", {}) or {}
        hp = h.get("preserved", True)
        return (
            f"correct={c}, hedge_preserved={hp}, "
            f"valid_cit={cf.get('valid')}/{cf.get('n')}, {sup_str}"
        )
    if track == "definitions":
        v = (md.get("verbal") or {}).get("verdict", "?")
        return f"verbal={v}, valid_cit={cf.get('valid')}/{cf.get('n')}, {sup_str}"
    if track == "arguments":
        r = md.get("rubric") or {}
        return (
            f"elements_present={r.get('fraction_present', 0):.0%}, "
            f"valid_cit={cf.get('valid')}/{cf.get('n')}, {sup_str}"
        )
    if track == "synthesis":
        cr = (md.get("citation_recall") or {}).get("recall", 0)
        integ = (md.get("integration") or {}).get("verdict", "?")
        rub = (md.get("rubric") or {}).get("fraction_present", 0)
        return (
            f"recall={cr:.0%}, integration={integ}, "
            f"elements={rub:.0%}, valid_cit={cf.get('valid')}/{cf.get('n')}, {sup_str}"
        )
    if track == "open_research":
        r = md.get("rubric") or {}
        return (
            f"comp={r.get('comprehensiveness')} depth={r.get('depth')} "
            f"instr={r.get('instruction_following')} read={r.get('readability')}; "
            f"valid_cit={cf.get('valid')}/{cf.get('n')}"
        )
    return ""


# --- Aggregate renderer ------------------------------------------------------


def _render_aggregate(views: list[TrackView]) -> str:
    if not views:
        return "No track logs found."
    lines: list[str] = []
    lines.append("# forethought-bench - Full smoke benchmark")
    lines.append("")
    bv = views[0].bench_version
    agent = views[0].agent
    judge = views[0].judge
    total_items = sum(v.n_items for v in views)
    total_wall = sum(v.wall_s for v in views)
    overall = (
        sum(v.composite_mean * v.n_items for v in views) / total_items
        if total_items
        else 0.0
    )
    lines.append(
        f"**Bench v**: `{bv}`  **Agent**: `{agent}`  **Judge**: `{judge}`  "
        f"**Total items**: {total_items}  **Wall**: {total_wall:.0f}s  "
        f"**Overall composite (n-weighted)**: **{overall:.3f}**"
    )
    lines.append("")
    lines.append("## Per-track summary")
    lines.append("")
    lines.append("| Track | Tier | n | Composite | Wall (s) |")
    lines.append("|---|---|---:|---:|---:|")
    for v in views:
        lines.append(
            f"| {v.track} | {v.tier} | {v.n_items} | **{v.composite_mean:.3f}** | {v.wall_s:.0f} |"
        )
    lines.append("")
    for v in views:
        lines.extend(_render_track_md(v))
    return "\n".join(lines)


def _render_aggregate_html(views: list[TrackView]) -> str:
    def esc(x: str) -> str:
        return html.escape(str(x))

    def color(c: float) -> str:
        if c >= 0.85:
            return "ok"
        if c >= 0.6:
            return "warn"
        return "bad"

    bv = views[0].bench_version if views else "?"
    agent = views[0].agent if views else "?"
    judge = views[0].judge if views else "?"
    total_items = sum(v.n_items for v in views)
    total_wall = sum(v.wall_s for v in views)
    overall = (
        sum(v.composite_mean * v.n_items for v in views) / total_items
        if total_items
        else 0.0
    )

    track_rows = "".join(
        f"<tr><td>{esc(v.track)}</td><td>{esc(v.tier)}</td>"
        f"<td class='num'>{v.n_items}</td>"
        f"<td class='num composite-{color(v.composite_mean)}'>{v.composite_mean:.3f}</td>"
        f"<td class='num'>{v.wall_s:.0f}</td></tr>"
        for v in views
    )

    drill = []
    for v in views:
        item_rows = []
        for s in v.samples:
            iv = _to_item_view(v.track, s)
            item_rows.append(
                f"<tr><td>{esc(iv.item_id)}</td>"
                f"<td>{esc(iv.question[:80])}...</td>"
                f"<td class='num composite-{color(iv.composite)}'>{iv.composite:.2f}</td>"
                f"<td>{esc(_highlight_for(v.track, iv.score_metadata))}</td>"
                f"</tr>"
            )
        drill.append(
            f"<details open class='track'><summary><strong>{esc(v.track)}</strong> "
            f"(n={v.n_items}, composite "
            f"<span class='composite-{color(v.composite_mean)}'>{v.composite_mean:.3f}</span>)</summary>"
            f"<table><thead><tr><th>ID</th><th>Question</th>"
            f"<th class='num'>Composite</th><th>Highlights</th></tr></thead>"
            f"<tbody>{''.join(item_rows)}</tbody></table></details>"
        )

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>forethought-bench - aggregate</title>
<style>
  :root {{
    --bg: #fbfaf4; --ink: #2f2a26; --coral: #ff6f43;
    --ok: #1f8a4c; --warn: #b58105; --bad: #b81e1e;
    --rule: #e6e0d4; --code: #f1ece0;
  }}
  body {{ background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;
    max-width: 1080px; margin: 32px auto; padding: 0 24px; }}
  h1 {{ font-size: 28px; margin: 0 0 8px; }}
  h2 {{ font-size: 20px; margin: 28px 0 8px; border-bottom: 1px solid var(--rule); padding-bottom: 6px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }}
  th, td {{ text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  th {{ background: rgba(0,0,0,0.03); }}
  .composite-ok {{ color: var(--ok); font-weight: 600; }}
  .composite-warn {{ color: var(--warn); font-weight: 600; }}
  .composite-bad {{ color: var(--bad); font-weight: 600; }}
  .meta {{ color: #6b6358; font-size: 13px; }}
  .kpi {{ display: inline-block; padding: 8px 12px; background: white; border: 1px solid var(--rule);
          border-radius: 6px; margin-right: 8px; font-size: 14px; }}
  .track {{ margin: 14px 0; padding: 8px 14px; background: white; border: 1px solid var(--rule);
            border-radius: 6px; }}
  .track summary {{ cursor: pointer; }}
  code {{ background: var(--code); padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }}
</style></head><body>

<h1>forethought-bench - Full smoke benchmark</h1>
<p class="meta">Bench v<code>{esc(bv)}</code> &middot; agent <code>{esc(agent)}</code>
&middot; judge <code>{esc(judge)}</code></p>

<div>
  <span class="kpi"><strong>Total items</strong>: {total_items}</span>
  <span class="kpi"><strong>Wall</strong>: {total_wall:.0f}s</span>
  <span class="kpi"><strong>Overall composite</strong>:
    <span class="composite-{color(overall)}">{overall:.3f}</span></span>
</div>

<h2>Per-track</h2>
<table>
  <thead><tr><th>Track</th><th>Tier</th><th class="num">n</th><th class="num">Composite</th><th class="num">Wall (s)</th></tr></thead>
  <tbody>{track_rows}</tbody>
</table>

<h2>Drill-down</h2>
{''.join(drill)}

</body></html>"""


# --- Entrypoints -------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("log_path", nargs="?", default=None)
    parser.add_argument(
        "--aggregate",
        default=None,
        help="Render aggregate report from all .eval files in this directory",
    )
    parser.add_argument("--md-out", default="report.md")
    parser.add_argument("--html-out", default="report.html")
    args = parser.parse_args()

    if args.aggregate:
        log_paths = sorted(glob.glob(os.path.join(args.aggregate, "*.eval")))
        if not log_paths:
            sys.exit(f"No .eval files in {args.aggregate}")
        views = [_track_view(p) for p in log_paths]
        # Stable display order: claim_recall, definitions, arguments, synthesis, open_research.
        order = {
            "claim_recall": 0,
            "definitions": 1,
            "arguments": 2,
            "synthesis": 3,
            "open_research": 4,
        }
        views.sort(key=lambda v: order.get(v.track, 99))
        md = _render_aggregate(views)
        Path(args.md_out).write_text(md)
        Path(args.html_out).write_text(_render_aggregate_html(views))
        print(md[:4000])
        print()
        print(f"Wrote: {args.md_out} ({len(md)} chars)")
        print(f"Wrote: {args.html_out}")
        return 0

    log_path = args.log_path or _latest_log()
    view = _track_view(log_path)
    lines: list[str] = [
        f"# forethought-bench - {view.track}",
        "",
        f"**Bench v**: `{view.bench_version}`  **Tier**: `{view.tier}`  "
        f"**Items**: {view.n_items}  **Wall**: {view.wall_s:.0f}s  "
        f"**Composite**: **{view.composite_mean:.3f}**",
        f"**Agent**: `{view.agent}`  **Judge**: `{view.judge}`",
        "",
    ]
    lines.extend(_render_track_md(view))
    md = "\n".join(lines)
    Path(args.md_out).write_text(md)
    Path(args.html_out).write_text(_render_aggregate_html([view]))
    print(md[:3000])
    print()
    print(f"Wrote: {args.md_out}")
    print(f"Wrote: {args.html_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
