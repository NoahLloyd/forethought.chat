"""Render an Inspect AI eval log into a human-friendly report.

Outputs:
  - report.md  - terminal-friendly markdown summary
  - report.html - self-contained HTML with per-item drill-down

Usage:
  python scripts/render_report.py                 # latest log under logs/
  python scripts/render_report.py logs/foo.eval   # specific log
"""

from __future__ import annotations

import argparse
import glob
import html
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from inspect_ai.log import read_eval_log


@dataclass
class ItemView:
    item_id: str
    question: str
    target: str
    answer: str
    composite: float
    correctness: float
    correctness_rationale: str
    hedge_preserved: bool
    hedge_missing: list[str]
    cit_score: float
    cit_n: int
    cit_valid: int
    cit_fab: int
    cit_unsup: int
    cit_partial: int
    cit_checks: list[dict[str, Any]]
    item: dict[str, Any]


def _latest_log() -> str:
    candidates = sorted(glob.glob("logs/*.eval"))
    if not candidates:
        sys.exit("No log files in logs/")
    return candidates[-1]


def _to_view(sample: Any) -> ItemView:
    score = next(iter(sample.scores.values())) if sample.scores else None
    md = (score.metadata or {}) if score else {}
    cit = md.get("citation_faithfulness", {})
    hedge = md.get("hedge", {})
    item_dump = (sample.metadata or {}).get("item", {})
    return ItemView(
        item_id=str(sample.id),
        question=item_dump.get("question") or (
            sample.input if isinstance(sample.input, str) else ""
        ),
        target=str(sample.target) if sample.target else "",
        answer=(sample.output.completion if sample.output else "") or "",
        composite=float(score.value) if score and isinstance(score.value, int | float) else 0.0,
        correctness=float(md.get("correctness", 0.0)),
        correctness_rationale=md.get("correctness_rationale", ""),
        hedge_preserved=bool(hedge.get("preserved", True)),
        hedge_missing=list(hedge.get("missing_hedges", [])),
        cit_score=float(cit.get("score", 0.0)),
        cit_n=int(cit.get("n", 0)),
        cit_valid=int(cit.get("valid", 0)),
        cit_fab=int(cit.get("fabricated", 0)),
        cit_unsup=int(cit.get("unsupportive", 0)),
        cit_partial=int(cit.get("partial", 0)),
        cit_checks=list(md.get("citation_checks", []) or []),
        item=item_dump,
    )


def _wall_seconds(log) -> float:
    stats = getattr(log, "stats", None)
    if stats is None:
        return 0.0
    started = getattr(stats, "started_at", None)
    completed = getattr(stats, "completed_at", None)
    if started is None or completed is None:
        return 0.0
    from datetime import datetime
    try:
        s = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
        c = datetime.fromisoformat(str(completed).replace("Z", "+00:00"))
        return max(0.0, (c - s).total_seconds())
    except Exception:
        return 0.0


def _aggregate(views: list[ItemView]) -> dict[str, Any]:
    n = len(views)
    if n == 0:
        return {}
    return {
        "n": n,
        "composite_mean": sum(v.composite for v in views) / n,
        "correctness_mean": sum(v.correctness for v in views) / n,
        "hedge_pass_rate": sum(1 for v in views if v.hedge_preserved) / n,
        "citation_faithfulness_mean": sum(v.cit_score for v in views) / n,
        "citations_total": sum(v.cit_n for v in views),
        "citations_valid": sum(v.cit_valid for v in views),
        "citations_fabricated": sum(v.cit_fab for v in views),
        "citations_unsupportive": sum(v.cit_unsup for v in views),
        "citations_partial": sum(v.cit_partial for v in views),
    }


def _render_markdown(log: Any, views: list[ItemView], agg: dict[str, Any]) -> str:
    eval_meta = log.eval
    started = getattr(log, "stats", None)
    started_at = getattr(log.eval, "created", None) if log.eval else None

    lines: list[str] = []
    lines.append("# forethought-bench - Track 2 (Specific Claim Recall)")
    lines.append("")
    em = eval_meta.metadata or {}
    tier = em.get("tier", "?")
    bv = em.get("benchmark_version", "?")
    judge_name = em.get("judge", "?")
    agent_name = em.get("agent", "?")
    wall_s = _wall_seconds(log)
    lines.append(
        f"**Status**: {log.status}    **Items**: {agg['n']}    **Tier**: `{tier}`    "
        f"**Bench v**: `{bv}`    **Wall**: {wall_s:.0f}s"
    )
    lines.append(f"**Run**: `{eval_meta.run_id}`    **Agent**: `{agent_name}`    **Judge**: `{judge_name}`")
    if started_at:
        lines.append(f"**Started**: {started_at}")
    lines.append("")
    lines.append("## What was run")
    lines.append("")
    lines.append(
        "Track 2 grades whether the agent under test reproduces specific "
        "numeric / named claims from named Forethought papers, with hedge "
        "preservation and a multi-stage citation faithfulness check."
    )
    lines.append("")
    lines.append("**Composite score (per item):**")
    lines.append("```")
    lines.append("score = 0.5 * correctness            (numeric within tolerance, or verbal MATCH)")
    lines.append("      + 0.2 * hedge_preserved        (binary; vacuous when source has no hedges)")
    lines.append("      + 0.3 * citation_faithfulness  (fraction of citations with verdict VALID)")
    lines.append("```")
    lines.append("")
    lines.append("**Pipeline (Inspect AI orchestration):**")
    lines.append(f"- Agent under test: forethought-chat at `http://localhost:3000` (chat app uses claude-sonnet-4-6)")
    lines.append("- Post-hoc structured-output extractor: `claude-haiku-4-5-20251001`")
    lines.append("- Verbal-match / citation-support judge: `claude-sonnet-4-6`")
    lines.append("- Corpus: 108 records loaded from forethoughtchat data/content/")
    lines.append("")
    lines.append("**Citation-faithfulness pipeline (4 stages):**")
    lines.append("1. Extract `(claim, citation)` pairs from agent output.")
    lines.append("2. Look up cited URL in the local corpus index.")
    lines.append("3. Fuzzy-match the quoted passage inside the document at that URL.")
    lines.append("4. Ask a judge whether the located passage actually supports the claim.")
    lines.append("Per-citation verdict: `valid` / `fabricated` / `real_but_unsupportive` / `partial`.")
    lines.append("")

    lines.append("## Aggregate")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Composite score (mean) | **{agg['composite_mean']:.3f}** |")
    lines.append(f"| Correctness rate | {agg['correctness_mean']:.2%} |")
    lines.append(f"| Hedge preservation rate | {agg['hedge_pass_rate']:.2%} |")
    lines.append(f"| Citation faithfulness (mean) | {agg['citation_faithfulness_mean']:.2%} |")
    lines.append("")
    lines.append("**Citation verdict breakdown** (across all citations the agent emitted):")
    lines.append("")
    lines.append("| Verdict | Count | Share |")
    lines.append("|---|---:|---:|")
    total = agg["citations_total"] or 1
    lines.append(f"| valid | {agg['citations_valid']} | {agg['citations_valid'] / total:.0%} |")
    lines.append(f"| fabricated | {agg['citations_fabricated']} | {agg['citations_fabricated'] / total:.0%} |")
    lines.append(f"| real_but_unsupportive | {agg['citations_unsupportive']} | {agg['citations_unsupportive'] / total:.0%} |")
    lines.append(f"| partial | {agg['citations_partial']} | {agg['citations_partial'] / total:.0%} |")
    lines.append(f"| **total** | **{agg['citations_total']}** |  |")
    lines.append("")

    lines.append("## Per-item results")
    lines.append("")
    lines.append("| # | Item | Composite | Correct? | Hedges | Citations valid/n |")
    lines.append("|---|---|---:|---|---|---:|")
    for v in views:
        correct_mark = "PASS" if v.correctness >= 0.99 else (
            "PARTIAL" if v.correctness >= 0.5 else "FAIL"
        )
        hedge_mark = "OK" if v.hedge_preserved else f"MISSING {v.hedge_missing}"
        lines.append(
            f"| {v.item_id} | {v.question[:60]}... | {v.composite:.2f} | {correct_mark} | {hedge_mark} | {v.cit_valid}/{v.cit_n} |"
        )
    lines.append("")

    # Failure highlights.
    failures = [v for v in views if v.composite < 0.7]
    if failures:
        lines.append("## Failure highlights")
        lines.append("")
        for v in failures[:5]:
            lines.append(f"### {v.item_id} - composite {v.composite:.2f}")
            lines.append(f"**Question:** {v.question}")
            lines.append(f"**Target:** `{v.target}`")
            lines.append("")
            lines.append("**Agent answer (truncated):**")
            lines.append("> " + v.answer[:400].replace("\n", "\n> ") + ("..." if len(v.answer) > 400 else ""))
            lines.append("")
            lines.append(
                f"**Correctness:** {v.correctness:.2f} - {v.correctness_rationale}"
            )
            if not v.hedge_preserved:
                lines.append(f"**Hedge stripped:** missing {v.hedge_missing}")
            if v.cit_n > 0:
                lines.append(
                    f"**Citations:** {v.cit_valid}/{v.cit_n} valid; "
                    f"{v.cit_fab} fabricated, {v.cit_unsup} unsupportive, {v.cit_partial} partial"
                )
                bad = [c for c in v.cit_checks if c.get("verdict") != "valid"]
                for c in bad[:3]:
                    line = f"  - [{c.get('verdict')}] "
                    if c.get("parsed_claim"):
                        line += f"claim: {(c.get('parsed_claim') or '')[:140]}"
                    rationale = (c.get("support_rationale") or "")[:200]
                    if rationale:
                        line += f" ; rationale: {rationale}"
                    lines.append(line)
            lines.append("")
    lines.append("")
    lines.append("---")
    lines.append("Open `report.html` in a browser for the full per-item drill-down.")
    return "\n".join(lines)


def _render_html(log: Any, views: list[ItemView], agg: dict[str, Any]) -> str:
    eval_meta = log.eval

    def esc(x: str) -> str:
        return html.escape(str(x))

    def verdict_badge(v: str) -> str:
        cls = {
            "valid": "ok",
            "partial": "warn",
            "real_but_unsupportive": "bad",
            "fabricated": "bad",
        }.get(v, "neutral")
        return f'<span class="badge {cls}">{esc(v)}</span>'

    def composite_color(c: float) -> str:
        if c >= 0.85:
            return "ok"
        if c >= 0.6:
            return "warn"
        return "bad"

    rows: list[str] = []
    for v in views:
        rows.append(
            f"<tr><td>{esc(v.item_id)}</td>"
            f"<td>{esc(v.question[:90])}...</td>"
            f'<td class="num composite-{composite_color(v.composite)}">{v.composite:.2f}</td>'
            f'<td class="num">{v.correctness:.2f}</td>'
            f"<td>{'OK' if v.hedge_preserved else esc('MISSING ' + str(v.hedge_missing))}</td>"
            f'<td class="num">{v.cit_valid}/{v.cit_n}</td>'
            f'<td><a href="#item-{esc(v.item_id)}">drill</a></td></tr>'
        )

    drill: list[str] = []
    for v in views:
        cit_rows = []
        for c in v.cit_checks:
            cit_rows.append(
                f"<tr>"
                f"<td>{verdict_badge(c.get('verdict', '?'))}</td>"
                f"<td>{esc((c.get('parsed_claim') or '')[:240])}</td>"
                f"<td>{esc((c.get('support_rationale') or '')[:480])}</td>"
                f"</tr>"
            )
        drill.append(f"""
<details id="item-{esc(v.item_id)}" class="drill">
  <summary><strong>{esc(v.item_id)}</strong> - composite
    <span class="composite-{composite_color(v.composite)}">{v.composite:.2f}</span>
    | correctness {v.correctness:.2f}
    | hedges {'OK' if v.hedge_preserved else 'STRIPPED'}
    | citations {v.cit_valid}/{v.cit_n} valid</summary>
  <div class="body">
    <p class="q"><strong>Question.</strong> {esc(v.question)}</p>
    <p><strong>Target.</strong> <code>{esc(v.target)}</code></p>
    <details><summary>Agent answer ({len(v.answer)} chars)</summary>
      <pre class="answer">{esc(v.answer)}</pre></details>
    <p><strong>Correctness rationale.</strong> {esc(v.correctness_rationale)}</p>
    {('<p class="bad"><strong>Hedge stripped.</strong> missing: <code>' + esc(str(v.hedge_missing)) + '</code></p>') if not v.hedge_preserved else ''}
    <p><strong>Citation breakdown.</strong> {v.cit_valid} valid /
       {v.cit_fab} fabricated / {v.cit_unsup} real-but-unsupportive /
       {v.cit_partial} partial (of {v.cit_n} total)</p>
    <table class="citations">
      <thead><tr><th>Verdict</th><th>Parsed claim</th><th>Support rationale</th></tr></thead>
      <tbody>{''.join(cit_rows)}</tbody>
    </table>
  </div>
</details>
""")

    template = """<!doctype html>
<html><head><meta charset="utf-8"><title>forethought-bench - Track 2</title>
<style>
  :root {
    --bg: #fbfaf4; --ink: #2f2a26; --coral: #ff6f43;
    --ok: #1f8a4c; --warn: #b58105; --bad: #b81e1e;
    --rule: #e6e0d4; --code: #f1ece0;
  }
  body { background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;
    max-width: 1080px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 20px; margin: 28px 0 8px; border-bottom: 1px solid var(--rule); padding-bottom: 6px; }
  h3 { font-size: 16px; margin: 16px 0 6px; }
  .meta { color: #6b6358; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { font-weight: 600; background: rgba(0,0,0,0.02); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600;
           border: 1px solid currentColor; }
  .badge.ok { color: var(--ok); }
  .badge.warn { color: var(--warn); }
  .badge.bad { color: var(--bad); }
  .badge.neutral { color: #888; }
  .composite-ok { color: var(--ok); font-weight: 600; }
  .composite-warn { color: var(--warn); font-weight: 600; }
  .composite-bad { color: var(--bad); font-weight: 600; }
  .drill { border: 1px solid var(--rule); border-radius: 6px; margin: 10px 0; padding: 10px 14px; background: white; }
  .drill summary { cursor: pointer; font-size: 14px; }
  .drill .body { padding: 8px 0 0; }
  .drill pre.answer { background: var(--code); padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 13px; max-height: 320px; overflow: auto; }
  .drill .citations { font-size: 13px; }
  .drill .q { font-size: 14px; }
  .bad { color: var(--bad); }
  .pipeline { background: white; border: 1px solid var(--rule); padding: 12px 16px; border-radius: 6px; }
  .pipeline ol { margin: 6px 0; padding-left: 22px; }
  code { background: var(--code); padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
  .kpi { background: white; border: 1px solid var(--rule); border-radius: 6px; padding: 12px 14px; }
  .kpi .label { color: #6b6358; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
</style></head><body>

<h1>forethought-bench - Track 2 (Specific Claim Recall)</h1>
<p class="meta">Run <code>__RUN__</code> &middot; status <strong>__STATUS__</strong> &middot; __N__ items &middot; tier <code>__TIER__</code>
&middot; bench v<code>__BV__</code> &middot; wall <strong>__WALL__</strong>s</p>
<p class="meta">Agent <code>__AGENT__</code> &middot; judge <code>__JUDGE__</code> &middot; corpus <code>__CORPUS_RECORDS__</code> records</p>

<h2>What this evaluates</h2>
<div class="pipeline">
  <p>Track 2 grades whether the agent under test reproduces specific numeric / named claims from named Forethought papers,
  with <strong>hedge preservation</strong> (don't strip "<code>~50%</code>" into "50%") and a
  <strong>multi-stage citation faithfulness pipeline</strong>. End-to-end LLM judging is intentionally not used for citations:
  the "real paper, but doesn't actually support the claim" failure is invisible to end-to-end judging and the most damaging trust failure for a research-grounded agent.</p>
  <p><strong>Composite score per item:</strong></p>
  <pre>score = 0.5 &middot; correctness            (numeric within tolerance, or verbal MATCH)
      + 0.2 &middot; hedge_preserved        (binary; vacuous when source had no hedges)
      + 0.3 &middot; citation_faithfulness  (fraction of citations with verdict VALID)</pre>
  <p><strong>Citation faithfulness (4 stages):</strong></p>
  <ol>
    <li>Extract <code>(claim, citation)</code> pairs from agent output.</li>
    <li>Look up cited URL in the local corpus.</li>
    <li>Fuzzy-match the quoted passage inside the document at that URL.</li>
    <li>Judge: does the located passage support the claim?</li>
  </ol>
  <p>Per-citation verdict:
    <span class="badge ok">valid</span>
    <span class="badge bad">fabricated</span>
    <span class="badge bad">real_but_unsupportive</span>
    <span class="badge warn">partial</span>
  </p>
</div>

<h2>Aggregate</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="label">Composite (mean)</div><div class="value composite-__COMP_CLASS__">__COMPOSITE__</div></div>
  <div class="kpi"><div class="label">Correctness rate</div><div class="value">__CORRECTNESS__</div></div>
  <div class="kpi"><div class="label">Hedge preservation</div><div class="value">__HEDGE__</div></div>
  <div class="kpi"><div class="label">Citation faithfulness</div><div class="value">__CITFAITH__</div></div>
</div>

<h3>Citation verdict breakdown</h3>
<table>
  <thead><tr><th>Verdict</th><th class="num">Count</th><th class="num">Share</th></tr></thead>
  <tbody>
    <tr><td>__VALID_BADGE__</td><td class="num">__VALID__</td><td class="num">__VALID_PCT__</td></tr>
    <tr><td>__FAB_BADGE__</td><td class="num">__FAB__</td><td class="num">__FAB_PCT__</td></tr>
    <tr><td>__UNSUP_BADGE__</td><td class="num">__UNSUP__</td><td class="num">__UNSUP_PCT__</td></tr>
    <tr><td>__PART_BADGE__</td><td class="num">__PART__</td><td class="num">__PART_PCT__</td></tr>
    <tr><td><strong>total</strong></td><td class="num"><strong>__TOTAL__</strong></td><td></td></tr>
  </tbody>
</table>

<h2>Per-item results</h2>
<table>
  <thead><tr><th>ID</th><th>Question</th><th class="num">Composite</th><th class="num">Correctness</th><th>Hedges</th><th class="num">Citations</th><th></th></tr></thead>
  <tbody>__ROWS__</tbody>
</table>

<h2>Drill-down</h2>
__DRILL__

</body></html>"""

    total = agg["citations_total"] or 1
    out = template
    em = eval_meta.metadata or {}
    tier_val = em.get("tier", "?")
    bv_val = em.get("benchmark_version", "?")
    judge_val = em.get("judge", "?")
    repl = {
        "__RUN__": esc(eval_meta.run_id),
        "__TIER__": esc(tier_val),
        "__BV__": esc(bv_val),
        "__JUDGE__": esc(judge_val),
        "__WALL__": str(int(_wall_seconds(log))),
        "__STATUS__": esc(log.status),
        "__N__": str(agg["n"]),
        "__AGENT__": "forethought-chat:http://localhost:3000",
        "__CORPUS_RECORDS__": str((log.eval.task_args or {}).get("content_dir", "")) or "108",
        "__COMPOSITE__": f"{agg['composite_mean']:.3f}",
        "__COMP_CLASS__": composite_color(agg["composite_mean"]),
        "__CORRECTNESS__": f"{agg['correctness_mean']:.0%}",
        "__HEDGE__": f"{agg['hedge_pass_rate']:.0%}",
        "__CITFAITH__": f"{agg['citation_faithfulness_mean']:.0%}",
        "__VALID_BADGE__": verdict_badge("valid"),
        "__FAB_BADGE__": verdict_badge("fabricated"),
        "__UNSUP_BADGE__": verdict_badge("real_but_unsupportive"),
        "__PART_BADGE__": verdict_badge("partial"),
        "__VALID__": str(agg["citations_valid"]),
        "__FAB__": str(agg["citations_fabricated"]),
        "__UNSUP__": str(agg["citations_unsupportive"]),
        "__PART__": str(agg["citations_partial"]),
        "__VALID_PCT__": f"{agg['citations_valid'] / total:.0%}",
        "__FAB_PCT__": f"{agg['citations_fabricated'] / total:.0%}",
        "__UNSUP_PCT__": f"{agg['citations_unsupportive'] / total:.0%}",
        "__PART_PCT__": f"{agg['citations_partial'] / total:.0%}",
        "__TOTAL__": str(agg["citations_total"]),
        "__ROWS__": "".join(rows),
        "__DRILL__": "".join(drill),
    }
    for k, v in repl.items():
        out = out.replace(k, v)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("log_path", nargs="?", default=None)
    parser.add_argument("--md-out", default="report.md")
    parser.add_argument("--html-out", default="report.html")
    args = parser.parse_args()

    log_path = args.log_path or _latest_log()
    log = read_eval_log(log_path)
    samples = log.samples or []
    views = [_to_view(s) for s in samples]
    agg = _aggregate(views)
    if not agg:
        sys.exit("No samples in log.")

    md = _render_markdown(log, views, agg)
    Path(args.md_out).write_text(md)
    html_text = _render_html(log, views, agg)
    Path(args.html_out).write_text(html_text)

    print(md)
    print()
    print(f"Wrote: {args.md_out}")
    print(f"Wrote: {args.html_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
