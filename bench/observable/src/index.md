---
title: forethought-bench
toc: false
---

```js
const d = await FileAttachment("data/dashboard.json").json();
const tracks = d.active_tracks;
const colors = d.track_colors;
const latest = d.latest;
const prev   = d.prev;
const od     = d.overall_delta;
```

```js
// ── Derived helpers ────────────────────────────────────────────────────────────
const fmtScore = v => v == null ? "—" : v.toFixed(3);
const fmtPct   = v => v == null ? "—" : v.toFixed(1) + "%";
const fmtDelta = v => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(3);
const scoreColor = v => {
  if (v == null) return "#eee";
  if (v >= 0.80) return "#bce4c1";
  if (v >= 0.70) return "#dcefb4";
  if (v >= 0.60) return "#f9eba7";
  if (v >= 0.45) return "#f4ca7f";
  return "#e89c87";
};

const trackDesc = {
  definitions:  "Recall of domain-specific terms from the corpus. Composite = 0.6 verbal_match + 0.2 citation_faithfulness + 0.2 answer_support.",
  claim_recall: "Precise recall of factual claims (numeric or categorical) including hedging language. Composite = 0.5 correctness + 0.2 hedge + 0.15 cite + 0.15 ans_sup.",
  arguments:    "Reconstruction of structured arguments: identify all required logical elements. Composite = 0.6 rubric + 0.2 cite + 0.2 ans_sup.",
  synthesis:    "Synthesise across multiple sources with full citation recall and integration. Composite = 0.25 cite_recall + 0.25 rubric + 0.20 integration + 0.15 cite + 0.15 ans_sup.",
};
```

<style>
/* ── Banner ── */
.banner {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 20px; border-radius: 12px;
  margin: 16px 0 24px; font-size: 16px;
}
.banner-improve { background: #dcfce7; color: #15803d; border: 1.5px solid #86efac; }
.banner-regress { background: #fee2e2; color: #b91c1c; border: 1.5px solid #fca5a5; }
.banner-flat    { background: #f1f5f9; color: #475569; border: 1.5px solid #cbd5e1; }
.banner-icon { font-size: 32px; line-height: 1; }
.banner-main { flex: 1; }
.banner-headline { font-weight: 800; font-size: 18px; line-height: 1.3; }
.banner-sub { font-size: 12.5px; opacity: 0.8; margin-top: 3px; font-family: var(--monospace); }

/* ── KPI grid ── */
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px; margin-bottom: 32px;
}
.kpi {
  background: var(--theme-background-alt);
  border: 1px solid var(--theme-foreground-faintest);
  border-radius: 10px; padding: 14px 16px;
}
.kpi-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .7px; color: var(--theme-foreground-muted); margin-bottom: 4px; }
.kpi-value { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.kpi-sub   { font-size: 11.5px; color: var(--theme-foreground-muted); margin-top: 3px; }
.kpi-up    { color: #15803d; }
.kpi-dn    { color: #b91c1c; }

/* ── Section details ── */
details.section {
  border: 1px solid var(--theme-foreground-faintest);
  border-radius: 10px; margin: 24px 0; overflow: hidden;
}
details.section summary {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 16px; cursor: pointer; user-select: none;
  background: var(--theme-background-alt);
  border-bottom: 1px solid transparent;
  list-style: none; font-weight: 700; font-size: 15px;
}
details.section summary::-webkit-details-marker { display: none; }
details.section[open] summary { border-bottom-color: var(--theme-foreground-faintest); }
details.section summary:hover { background: var(--theme-background); }
.section-arrow { font-size: 10px; color: var(--theme-foreground-muted); transition: transform .15s; }
details.section[open] .section-arrow { transform: rotate(90deg); }
.section-hint { font-size: 12px; font-weight: 400; color: var(--theme-foreground-muted); }
.section-body { padding: 20px; }

/* ── Misc ── */
.prose-summary { font-size: 14px; line-height: 1.7; color: var(--theme-foreground); margin-bottom: 24px; }
.prose-summary strong { color: var(--theme-foreground); }
.tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 4px; font-weight: 600; vertical-align: middle; }
.tag-up   { background: #dcfce7; color: #15803d; }
.tag-dn   { background: #fee2e2; color: #b91c1c; }
.tag-best { background: #fef9c3; color: #854d0e; }
.score-legend { display: flex; gap: 6px; align-items: center; font-size: 11.5px; flex-wrap: wrap; margin-bottom: 12px; }
.score-legend-label { color: var(--theme-foreground-muted); margin-right: 2px; }
.swatch { padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0,0,0,.08); font-family: var(--monospace); font-size: 11px; }
</style>

```js
// ── Improvement banner ─────────────────────────────────────────────────────────
const cls = od > 0.001 ? "improve" : od < -0.001 ? "regress" : "flat";
const icon = od > 0.001 ? "↑" : od < -0.001 ? "↓" : "→";

const movers = tracks
  .filter(t => Math.abs(d.track_deltas[t] ?? 0) >= 0.005)
  .sort((a, b) => Math.abs(d.track_deltas[b]) - Math.abs(d.track_deltas[a]))
  .map(t => {
    const dt = d.track_deltas[t];
    return `${t} ${dt > 0 ? "+" : ""}${dt.toFixed(3)}${dt > 0 ? " ↑" : " ↓"}`;
  });

display(html`<div class="banner banner-${cls}">
  <div class="banner-icon">${icon}</div>
  <div class="banner-main">
    <div class="banner-headline">
      Overall ${od != null ? (od > 0 ? "+" : "") + od.toFixed(3) : "—"}
      vs previous run · now ${latest.overall.toFixed(3)}
    </div>
    ${movers.length ? html`<div class="banner-sub">${movers.join("  ·  ")}</div>` : ""}
  </div>
  <div style="text-align:right;font-size:11.5px;color:currentColor;opacity:.7;font-family:var(--monospace)">
    ${latest.run_short} ${latest.run_label}<br>${latest.timestamp.slice(0, 10)}
  </div>
</div>`);
```

```js
// ── KPI cards ─────────────────────────────────────────────────────────────────
const deltaColor = od > 0.001 ? "kpi-up" : od < -0.001 ? "kpi-dn" : "";

display(html`<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Latest overall</div>
    <div class="kpi-value" style="background:${scoreColor(latest.overall)};border-radius:6px;padding:2px 6px;display:inline-block">${fmtScore(latest.overall)}</div>
    <div class="kpi-sub">${latest.n_total} items · ${latest.mode}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">vs Previous run</div>
    <div class="kpi-value ${deltaColor}">${od != null ? (od > 0 ? "+" : "") + od.toFixed(3) : "—"}</div>
    <div class="kpi-sub" title="${prev?.name ?? ''}">${prev ? prev.name.slice(-22) : "no prior run"}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Best ever</div>
    <div class="kpi-value">${fmtScore(d.overall_best)}</div>
    <div class="kpi-sub">across ${d.n_runs} runs</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Avg valid cite%</div>
    <div class="kpi-value">${(d.track_rows.reduce((s,r) => s + (r.valid_pct ?? 0), 0) / d.track_rows.length).toFixed(1)}%</div>
    <div class="kpi-sub">citations in corpus + supporting</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Avg answer support</div>
    <div class="kpi-value">${fmtScore(d.track_rows.reduce((s,r) => s + (r.ans_sup ?? 0), 0) / d.track_rows.length)}</div>
    <div class="kpi-sub">claims backed by cited evidence</div>
  </div>
</div>`);
```

```js
// ── Auto-generated prose summary ───────────────────────────────────────────────
const bullets = [];

// New bests
const newBests = d.track_rows.filter(r => r.is_best);
if (newBests.length)
  bullets.push(`<strong>New best${newBests.length > 1 ? "s" : ""}:</strong> ${newBests.map(r => `${r.track} hit ${fmtScore(r.latest)}`).join(", ")}.`);

// Biggest movers
const bigUp = d.track_rows.filter(r => (r.delta ?? 0) > 0.01).sort((a,b) => b.delta - a.delta);
const bigDn = d.track_rows.filter(r => (r.delta ?? 0) < -0.01).sort((a,b) => a.delta - b.delta);
if (bigUp.length)
  bullets.push(`<strong>Improved:</strong> ${bigUp.map(r => `${r.track} +${r.delta.toFixed(3)}`).join(", ")}.`);
if (bigDn.length)
  bullets.push(`<strong>Regressed:</strong> ${bigDn.map(r => `${r.track} ${r.delta.toFixed(3)}`).join(", ")}.`);

// Hardest item right now
const latestItems = d.matrix.filter(r => r.is_latest).sort((a,b) => a.composite - b.composite);
if (latestItems.length)
  bullets.push(`<strong>Hardest item:</strong> ${latestItems[0].item} (${fmtScore(latestItems[0].composite)}) · <strong>easiest:</strong> ${latestItems.at(-1).item} (${fmtScore(latestItems.at(-1).composite)}).`);

// Citation red flag
const lowCite = d.track_rows.filter(r => r.valid_pct != null && r.valid_pct < 30);
if (lowCite.length)
  bullets.push(`<strong>Low citation fidelity:</strong> ${lowCite.map(r => `${r.track} ${fmtPct(r.valid_pct)} valid`).join(", ")} — agent may be hallucinating sources.`);

display(html`<div class="prose-summary">${bullets.map(b => html`<p style="margin:0 0 6px">→ ${ Object.assign(document.createElement("span"), {innerHTML: b}) }</p>`)}${!bullets.length ? html`<p>No significant changes vs previous run.</p>` : ""}</div>`);
```

## Scores over time

_Each track is scored 0–1. Hover any dot for the exact score and run name. Larger dots = latest run. Dashed lines = benchmark version boundaries._

```js
resize(width => Plot.plot({
  width,
  height: 280,
  marginLeft: 45,
  marginBottom: 30,
  x: {
    label: null,
    tickFormat: i => d.runs[i]?.run_short ?? "",
    ticks: d.runs.map((_, i) => i),
  },
  y: { domain: [0, 1], label: "composite", grid: true },
  color: { domain: tracks, range: tracks.map(t => colors[t]), legend: true },
  marks: [
    Plot.ruleY([0.5, 0.75], { stroke: "#e2e8f0", strokeWidth: 1 }),

    // Version change markers
    ...d.runs.reduce((acc, r, i) => {
      if (i > 0 && r.bench_v !== d.runs[i-1].bench_v)
        acc.push(Plot.ruleX([i], { stroke: "#94a3b8", strokeDasharray: "4,3", strokeWidth: 1.5 }));
      return acc;
    }, []),

    Plot.line(d.series, {
      x: "run_idx", y: "composite", stroke: "track",
      strokeWidth: 2.5, curve: "monotone-x", strokeLinecap: "round",
    }),
    Plot.dot(d.series, {
      x: "run_idx", y: "composite", fill: "track",
      r: r => r.is_latest ? 6 : 3.5,
      stroke: r => r.is_latest ? "white" : null,
      strokeWidth: 2,
    }),
    Plot.tip(d.series, Plot.pointer({
      x: "run_idx", y: "composite",
      title: r => `${r.track}\n${r.composite.toFixed(3)}\n${r.run_short} ${r.run_label}\n${r.timestamp.slice(0,10)}`,
    })),
  ],
}))
```

## Track snapshot

_Grey bar = best ever (ceiling). Coloured bar = latest run. White tick = previous run. Labels show delta._

```js
// Build bullet chart data
const bullet = tracks.flatMap(t => {
  const row = d.track_rows.find(r => r.track === t);
  if (!row) return [];
  return [{ track: t, kind: "best",   v: row.best   },
          { track: t, kind: "latest", v: row.latest },
          { track: t, kind: "prev",   v: row.prev   }];
});

resize(width => Plot.plot({
  width,
  height: tracks.length * 56 + 40,
  marginLeft: 100,
  marginRight: 80,
  x: { domain: [0, 1], label: "composite score", grid: true },
  y: { domain: tracks, axis: null },
  marks: [
    // background = best ever
    Plot.barX(bullet.filter(r => r.kind === "best"), {
      y: "track", x: "v", fill: "#e2e8f0", rx: 4,
    }),
    // foreground = latest
    Plot.barX(bullet.filter(r => r.kind === "latest"), {
      y: "track", x: "v",
      fill: r => colors[r.track], fillOpacity: 0.85, rx: 4,
    }),
    // tick = prev
    Plot.tickX(bullet.filter(r => r.kind === "prev" && r.v != null), {
      y: "track", x: "v",
      stroke: "white", strokeWidth: 4, strokeLinecap: "round",
    }),
    Plot.tickX(bullet.filter(r => r.kind === "prev" && r.v != null), {
      y: "track", x: "v",
      stroke: r => colors[r.track], strokeWidth: 1.5, strokeLinecap: "round",
    }),
    // track name labels
    Plot.text(tracks, {
      x: 0, y: d => d,
      text: d => d, textAnchor: "end", dx: -8,
      fontWeight: "bold", fontSize: 13,
    }),
    // score + delta labels on right
    Plot.text(d.track_rows, {
      y: "track", x: "latest",
      text: r => {
        const dt = r.delta;
        const suffix = dt == null ? "" : ` (${dt > 0 ? "+" : ""}${dt.toFixed(3)})`;
        return r.latest.toFixed(3) + suffix;
      },
      textAnchor: "start", dx: 6, fontSize: 12,
      fill: r => (r.delta ?? 0) > 0.005 ? "#15803d" : (r.delta ?? 0) < -0.005 ? "#b91c1c" : "currentColor",
      fontWeight: r => Math.abs(r.delta ?? 0) > 0.005 ? "bold" : "normal",
    }),
    // "★ best" annotation
    Plot.text(d.track_rows.filter(r => r.is_best), {
      y: "track", x: 1,
      text: () => "★ new best",
      textAnchor: "end", dx: -4, fontSize: 11,
      fill: "#854d0e", fontWeight: "bold",
    }),
    Plot.tip(d.track_rows, Plot.pointerY({
      y: "track", x: "latest",
      title: r => `${r.track}\n${trackDesc[r.track] ?? ""}\n\nLatest:  ${fmtScore(r.latest)}\nPrev:    ${fmtScore(r.prev)}\nΔ:       ${fmtDelta(r.delta)}\nBest:    ${fmtScore(r.best)}\nValid cite: ${fmtPct(r.valid_pct)}\nAns sup: ${fmtScore(r.ans_sup)}`,
    })),
  ],
}))
```

<details class="section" open>
<summary><span class="section-arrow">▶</span> Item performance <span class="section-hint">— what the agent scores on each individual question</span></summary>
<div class="section-body">

_Hover any bar or cell for details. ★ marks a personal best (highest score ever for that item)._

```js
const trackFilter = view(Inputs.select(["all tracks", ...tracks], {label: "Show track"}));
```

**Items ranked by latest score**

```js
const filteredItems = d.matrix
  .filter(r => r.is_latest && (trackFilter === "all tracks" || r.track === trackFilter))
  .sort((a, b) => a.composite - b.composite);

resize(width => Plot.plot({
  width,
  height: filteredItems.length * 24 + 50,
  marginLeft: 200,
  marginRight: 70,
  x: { domain: [0, 1], label: "composite score", grid: true },
  y: { domain: filteredItems.map(r => r.item), axis: null },
  marks: [
    Plot.barX(filteredItems, {
      y: "item", x: "composite",
      fill: r => scoreColor(r.composite), rx: 3,
    }),
    Plot.text(filteredItems, {
      y: "item", x: 0,
      text: r => r.item_short || r.item.replace(/_/g, " "),
      textAnchor: "end", dx: -6, fontSize: 11.5,
      fill: r => colors[r.track],
    }),
    Plot.text(filteredItems, {
      y: "item", x: "composite",
      text: r => r.composite.toFixed(2) + (r.is_best ? " ★" : ""),
      textAnchor: "start", dx: 5, fontSize: 11,
      fill: r => r.is_best ? "#854d0e" : "currentColor",
      fontWeight: r => r.is_best ? "bold" : "normal",
    }),
    Plot.tip(filteredItems, Plot.pointer({
      y: "item", x: "composite",
      title: r => `${r.item}\n\nLatest: ${r.composite.toFixed(3)}${r.is_best ? " ★ personal best" : ""}\nTrack: ${r.track}`,
    })),
  ],
}))
```

**All runs heatmap** — each column is one run (oldest → latest), each row is one item

```js
const hmItems = [...new Set(
  d.matrix
    .filter(r => trackFilter === "all tracks" || r.track === trackFilter)
    .map(r => r.track + "/" + r.item)
)].sort();

const hmData = d.matrix.filter(r =>
  trackFilter === "all tracks" || r.track === trackFilter
);

const runNames = d.runs.map(r => r.name);

resize(width => Plot.plot({
  width,
  height: hmItems.length * 20 + 60,
  marginLeft: 210,
  marginTop: 50,
  x: { domain: runNames, axis: null },
  y: { domain: hmItems, axis: null },
  color: { domain: [0, 0.45, 0.60, 0.75, 1.0], range: ["#e89c87","#f4ca7f","#f9eba7","#dcefb4","#bce4c1"], label: "composite" },
  marks: [
    Plot.cell(hmData, {
      x: "run_name", y: r => r.track + "/" + r.item,
      fill: "composite", inset: 1,
    }),
    Plot.text(hmData.filter(r => r.is_best), {
      x: "run_name", y: r => r.track + "/" + r.item,
      text: () => "★", fontSize: 8, fill: "#854d0e",
    }),
    // Item labels on left
    Plot.text(hmItems, {
      x: () => runNames[0],
      y: d => d,
      text: d => d.split("/")[1].replace(/_/g, " "),
      textAnchor: "end", dx: -212, fontSize: 10.5,
      fill: d => colors[d.split("/")[0]] ?? "#888",
    }),
    // Run labels on top (latest highlighted)
    Plot.text(runNames, {
      x: d => d,
      y: () => hmItems[0],
      text: n => {
        const r = d.runs.find(r => r.name === n);
        return r?.run_short ?? n.slice(-6);
      },
      rotate: -45, textAnchor: "start",
      dy: -32, fontSize: 9.5,
      fill: n => n === latest.name ? "#6366f1" : "var(--theme-foreground-muted)",
      fontWeight: n => n === latest.name ? "bold" : "normal",
    }),
    Plot.tip(hmData, Plot.pointer({
      x: "run_name", y: r => r.track + "/" + r.item,
      title: r => `${r.item}\n${r.run_short} ${r.run_label}\nscore: ${r.composite.toFixed(3)}${r.is_best ? " ★ best ever" : ""}`,
    })),
  ],
}))
```

</div>
</details>

<details class="section">
<summary><span class="section-arrow">▶</span> Citation &amp; answer support health <span class="section-hint">— is the agent hallucinating sources?</span></summary>
<div class="section-body">

_**Valid cite%** = citation found in corpus AND actually supported the claim. Low numbers mean the agent is fabricating URLs or misattributing quotes. **Answer support** = fraction of answer claims backed by cited evidence._

**Citation quality — latest run by track**

```js
// Build stacked bar data for latest run
const citeLatest = d.track_rows.flatMap(r => [
  { track: r.track, kind: "Valid",         pct: r.valid_pct ?? 0 },
  { track: r.track, kind: "Unsupportive",  pct: r.unsup_pct ?? 0 },
  { track: r.track, kind: "Fabricated",    pct: r.fab_pct   ?? 0 },
]);

resize(width => Plot.plot({
  width, height: 200,
  marginLeft: 100,
  x: { domain: [0, 100], label: "% of citations" },
  y: { domain: tracks, axis: null },
  color: {
    domain: ["Valid", "Unsupportive", "Fabricated"],
    range:  ["#86efac", "#fde68a", "#fca5a5"],
    legend: true,
  },
  marks: [
    Plot.barX(citeLatest, {
      y: "track", x: "pct",
      fill: "kind",
      offset: "normalize",
      title: r => `${r.kind}: ${r.pct.toFixed(1)}%`,
    }),
    Plot.text(tracks, {
      x: 0, y: d => d,
      text: d => d, textAnchor: "end", dx: -8,
      fontWeight: "bold", fontSize: 13,
    }),
    Plot.tip(citeLatest, Plot.pointer({
      y: "track", x: "pct",
      title: r => `${r.track} — ${r.kind}: ${r.pct.toFixed(1)}%`,
    })),
  ],
}))
```

**Citation valid% over time** — higher is better

```js
resize(width => Plot.plot({
  width, height: 200,
  marginLeft: 45, marginBottom: 30,
  x: {
    label: null,
    tickFormat: i => d.runs[i]?.timestamp.slice(5, 10) ?? "",
    ticks: d.runs.filter((_, i) => i % Math.max(1, Math.floor(d.runs.length / 8)) === 0).map((_, i, a) => i * Math.max(1, Math.floor(d.runs.length / 8))),
  },
  y: { domain: [0, 100], label: "valid cite %", grid: true },
  color: { domain: tracks, range: tracks.map(t => colors[t]), legend: false },
  marks: [
    Plot.line(d.cite_series, {
      x: "run_idx", y: r => (r.valid_rate ?? 0) * 100,
      stroke: "track", strokeWidth: 2, curve: "monotone-x",
    }),
    Plot.dot(d.cite_series, {
      x: "run_idx", y: r => (r.valid_rate ?? 0) * 100,
      fill: "track", r: 3,
    }),
    Plot.tip(d.cite_series, Plot.pointer({
      x: "run_idx", y: r => (r.valid_rate ?? 0) * 100,
      title: r => `${r.track}\nvalid: ${(r.valid_rate*100).toFixed(1)}%\nfab: ${((r.fab_rate??0)*100).toFixed(1)}%\nunsup: ${((r.unsup_rate??0)*100).toFixed(1)}%\n${r.run_short} ${r.run_label}`,
    })),
  ],
}))
```

**Answer support over time** — how well claims are backed by cited evidence

```js
resize(width => Plot.plot({
  width, height: 200,
  marginLeft: 45, marginBottom: 30,
  x: { label: null, ticks: [] },
  y: { domain: [0, 1], label: "answer support", grid: true },
  color: { domain: tracks, range: tracks.map(t => colors[t]), legend: false },
  marks: [
    Plot.ruleY([0.75], { stroke: "#e2e8f0" }),
    Plot.line(d.cite_series.filter(r => r.ans_sup != null), {
      x: "run_idx", y: "ans_sup",
      stroke: "track", strokeWidth: 2, curve: "monotone-x",
    }),
    Plot.dot(d.cite_series.filter(r => r.ans_sup != null), {
      x: "run_idx", y: "ans_sup",
      fill: "track", r: 3,
    }),
    Plot.tip(d.cite_series.filter(r => r.ans_sup != null), Plot.pointer({
      x: "run_idx", y: "ans_sup",
      title: r => `${r.track}\nans sup: ${r.ans_sup.toFixed(3)}\n${r.run_name}`,
    })),
  ],
}))
```

</div>
</details>

<details class="section">
<summary><span class="section-arrow">▶</span> Run history <span class="section-hint">— all ${d.n_runs} runs, most recent first</span></summary>
<div class="section-body">

```js
const histRows = [...d.runs]
  .reverse()
  .map(r => ({
    timestamp: r.timestamp.slice(0, 16),
    run:       (r.run_short ?? "") + " " + (r.run_label ?? r.name),
    v:         r.bench_v,
    overall:   r.overall,
    ...Object.fromEntries(tracks.map(t => [t, r.tracks[t]?.composite ?? null])),
  }));

Inputs.table(histRows, {
  columns: ["timestamp", "run", "v", ...tracks, "overall"],
  header: { timestamp: "Time", run: "Run", v: "v", overall: "Overall" },
  format: {
    timestamp: v => v,
    run:       v => v,
    overall:   v => v == null ? "—" : v.toFixed(3),
    ...Object.fromEntries(tracks.map(t => [t, v => v == null ? "—" : v.toFixed(3)])),
  },
  rows: 20,
})
```

</div>
</details>

---

<small style="color:var(--theme-foreground-muted)">bench v${d.versions.join(", ")} · ${d.n_runs} runs · data from <code>bench/logs/</code> · generated ${d.generated} · dev: <code>cd bench/observable && bun run dev</code></small>
