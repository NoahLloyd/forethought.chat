#!/srv/agents/repos/forethought.chat/bench/.venv/bin/python3
"""Observable data loader — outputs bench history as JSON to stdout."""
import json
import math
import os
import re
import sys

BENCH_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../../"))
os.chdir(BENCH_DIR)
sys.path.insert(0, BENCH_DIR)

from scripts.history import discover_runs, TRACK_ORDER, _TRACK_COLORS  # noqa: E402

SKIP_TRACKS = {"boundary", "gate"}

_RUN_NUM_RE = re.compile(r'^r(\d+)_(.+)$')

def _parse_run_name(name):
    m = _RUN_NUM_RE.match(name)
    if m:
        num = int(m.group(1))
        label = m.group(2).replace('_', ' ')
        return num, label, f"#{num:02d}"
    return None, name, name[-10:]


def _f(v, decimals=4):
    """Round float, return None for None/NaN/Inf."""
    if v is None:
        return None
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return round(v, decimals)


def _clean(v):
    """Recursively replace non-finite floats with None for valid JSON."""
    if isinstance(v, float) and not math.isfinite(v):
        return None
    if isinstance(v, dict):
        return {k: _clean(vv) for k, vv in v.items()}
    if isinstance(v, list):
        return [_clean(i) for i in v]
    return v


runs = discover_runs("logs")
if not runs:
    print(json.dumps({"error": "no runs found"}))
    sys.exit(0)

active_tracks = [
    t for t in TRACK_ORDER
    if any(t in r.tracks for r in runs) and t not in SKIP_TRACKS
]

latest = runs[-1]
prev   = runs[-2] if len(runs) >= 2 else None

# ── Per-track bests ────────────────────────────────────────────────────────────
track_bests: dict[str, float] = {}
for t in active_tracks:
    scores = [
        r.tracks[t].composite_mean for r in runs
        if t in r.tracks and r.tracks[t].composite_mean == r.tracks[t].composite_mean
    ]
    if scores:
        track_bests[t] = max(scores)

# ── Per-item bests ─────────────────────────────────────────────────────────────
item_best: dict[tuple[str, str], float] = {}
for r in runs:
    for t, ts in r.tracks.items():
        if t in SKIP_TRACKS:
            continue
        for iid, v in ts.items:
            key = (t, iid)
            if key not in item_best or v > item_best[key]:
                item_best[key] = v

# ── Composite series (line chart) ─────────────────────────────────────────────
series = []
for i, r in enumerate(runs):
    _, r_label, r_short = _parse_run_name(r.name)
    for t in active_tracks:
        ts = r.tracks.get(t)
        if ts is None or ts.composite_mean != ts.composite_mean:
            continue
        series.append({
            "run_idx":   i,
            "run_name":  r.name,
            "run_short": r_short,
            "run_label": r_label,
            "timestamp": r.timestamp[:19],
            "bench_v":   r.benchmark_version,
            "track":     t,
            "composite": _f(ts.composite_mean),
            "is_latest": r.name == latest.name,
        })

# ── Citation series (citation health chart) ────────────────────────────────────
cite_series = []
for i, r in enumerate(runs):
    _, r_label, r_short = _parse_run_name(r.name)
    for t in active_tracks:
        ts = r.tracks.get(t)
        if ts is None or ts.valid_rate is None:
            continue
        cite_series.append({
            "run_idx":    i,
            "run_name":   r.name,
            "run_short":  r_short,
            "run_label":  r_label,
            "timestamp":  r.timestamp[:19],
            "track":      t,
            "valid_rate": _f(ts.valid_rate),
            "fab_rate":   _f(ts.fab_rate),
            "unsup_rate": _f(ts.unsup_rate),
            "ans_sup":    _f(ts.ans_sup_mean),
        })

# ── Item matrix (heatmap) ──────────────────────────────────────────────────────
matrix = []
seen_items: set[tuple[str, str]] = set()
for i, r in enumerate(runs):
    _, r_label, r_short = _parse_run_name(r.name)
    for t in active_tracks:
        ts = r.tracks.get(t)
        if ts is None:
            continue
        for iid, v in ts.items:
            seen_items.add((t, iid))
            matrix.append({
                "run_idx":   i,
                "run_name":  r.name,
                "run_short": r_short,
                "run_label": r_label,
                "timestamp": r.timestamp[:19],
                "track":     t,
                "item":      iid,
                "item_short": iid.replace(f"{t}_", "").replace("_", " "),
                "composite": _f(v),
                "is_latest": r.name == latest.name,
                "is_best":   abs(v - item_best.get((t, iid), v)) < 1e-9,
            })

# ── Run summaries ──────────────────────────────────────────────────────────────
def run_summary(r):
    _, r_label, r_short = _parse_run_name(r.name)
    tracks_out = {}
    for t in active_tracks:
        ts = r.tracks.get(t)
        if ts is None:
            continue
        tracks_out[t] = {
            "composite":  _f(ts.composite_mean),
            "n":          ts.n,
            "valid_rate": _f(ts.valid_rate),
            "fab_rate":   _f(ts.fab_rate),
            "unsup_rate": _f(ts.unsup_rate),
            "ans_sup":    _f(ts.ans_sup_mean),
        }
    # Overall composite across active tracks only
    active_track_summaries = [r.tracks[t] for t in active_tracks if t in r.tracks and r.tracks[t].n > 0]
    if active_track_summaries:
        weighted = sum(ts.composite_mean * ts.n for ts in active_track_summaries)
        n_active = sum(ts.n for ts in active_track_summaries)
        overall_active = weighted / n_active if n_active else None
    else:
        overall_active = None
    return {
        "name":       r.name,
        "run_num":    _parse_run_name(r.name)[0],
        "run_label":  r_label,
        "run_short":  r_short,
        "timestamp":  r.timestamp[:19],
        "bench_v":    r.benchmark_version,
        "mode":       r.mode,
        "overall":    _f(overall_active),
        "n_total":    sum(ts.n for ts in active_track_summaries),
        "tracks":     tracks_out,
    }

# ── Deltas ─────────────────────────────────────────────────────────────────────
def _active_overall(r):
    summaries = [r.tracks[t] for t in active_tracks if t in r.tracks and r.tracks[t].n > 0]
    if not summaries:
        return None
    weighted = sum(ts.composite_mean * ts.n for ts in summaries)
    n = sum(ts.n for ts in summaries)
    return weighted / n if n else None

track_deltas = {}
for t in active_tracks:
    l = latest.tracks.get(t)
    p = prev.tracks.get(t) if prev else None
    if l and p and l.composite_mean == l.composite_mean and p.composite_mean == p.composite_mean:
        track_deltas[t] = _f(l.composite_mean - p.composite_mean)

latest_overall = _active_overall(latest)
prev_overall = _active_overall(prev) if prev else None
overall_delta = _f(latest_overall - prev_overall) if (latest_overall is not None and prev_overall is not None) else None

all_overalls = [_active_overall(r) for r in runs]
overall_best = max(v for v in all_overalls if v is not None)

# ── Flat track rows for latest run (easy table use) ────────────────────────────
track_rows = []
for t in active_tracks:
    l = latest.tracks.get(t)   # TrackSummary dataclass
    p = prev.tracks.get(t) if prev else None
    if not l:
        continue
    track_rows.append({
        "track":     t,
        "n":         l.n,
        "latest":    _f(l.composite_mean),
        "prev":      _f(p.composite_mean) if p else None,
        "delta":     track_deltas.get(t),
        "best":      _f(track_bests.get(t)),
        "is_best":   track_bests.get(t) is not None
                     and l.composite_mean == l.composite_mean
                     and abs(l.composite_mean - track_bests[t]) < 1e-4,
        "valid_pct": round(l.valid_rate * 100, 1) if l.valid_rate is not None else None,
        "fab_pct":   round(l.fab_rate * 100, 1)   if l.fab_rate   is not None else None,
        "unsup_pct": round(l.unsup_rate * 100, 1) if l.unsup_rate is not None else None,
        "ans_sup":   _f(l.ans_sup_mean),
    })

out = {
    "generated":     latest.timestamp[:10],
    "n_runs":        len(runs),
    "versions":      sorted({r.benchmark_version for r in runs}),
    "active_tracks": active_tracks,
    "track_colors":  {t: _TRACK_COLORS.get(t, "#888") for t in active_tracks},
    "latest":        run_summary(latest),
    "prev":          run_summary(prev) if prev else None,
    "overall_best":  _f(overall_best),
    "overall_delta": overall_delta,
    "track_bests":   {t: _f(v) for t, v in track_bests.items()},
    "track_deltas":  track_deltas,
    "track_rows":    track_rows,
    "runs":          [run_summary(r) for r in runs],
    "series":        series,
    "cite_series":   cite_series,
    "matrix":        matrix,
}

print(json.dumps(_clean(out)))
