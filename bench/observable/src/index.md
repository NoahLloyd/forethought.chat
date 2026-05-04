---
title: forethought bench
toc: false
---

```js
const d = await FileAttachment("data/dashboard.json").json();
const tracks  = d.active_tracks;
const colors  = d.track_colors;
const latest  = d.latest;
const prev    = d.prev;
const od      = d.overall_delta;
```

```js
const fmtScore = v => v == null ? "—" : v.toFixed(3);
const fmtPct   = v => v == null ? "—" : v.toFixed(1) + "%";
const fmtDelta = v => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(3);

const scoreColor = v => {
  if (v == null) return "var(--theme-foreground-faintest)";
  if (v >= 0.80) return "#166534";
  if (v >= 0.70) return "#1d4ed8";
  if (v >= 0.60) return "#92400e";
  return "#9f1239";
};
const scoreBg = v => {
  if (v == null) return "transparent";
  if (v >= 0.80) return "#14532d22";
  if (v >= 0.70) return "#1e3a8a22";
  if (v >= 0.60) return "#78350f22";
  return "#88133722";
};

const trackDesc = {
  definitions:  "Recall of domain-specific terms from the corpus.\nComposite = 0.6 verbal_match + 0.2 citation_faithfulness + 0.2 answer_support.",
  claim_recall: "Precise recall of factual claims (numeric or categorical) including hedging language.\nComposite = 0.5 correctness + 0.2 hedge_preservation + 0.15 cite + 0.15 ans_sup.",
  arguments:    "Reconstruction of structured arguments: identify all required logical elements.\nComposite = 0.6 elements_rubric + 0.2 citation_faithfulness + 0.2 answer_support.",
  synthesis:    "Synthesise across multiple sources with full citation recall and integration.\nComposite = 0.25 cite_recall + 0.25 elements_rubric + 0.20 integration + 0.15 cite + 0.15 ans_sup.",
};
```

<style>
/* ── Reset Observable header chrome ── */
#observablehq-header { display: none !important; }

/* ── Layout ── */
.dash-header { margin: 24px 0 20px; }
.dash-title  { font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--theme-foreground-muted); margin-bottom: 8px; }

/* ── Banner ── */
.banner {
  display: flex; align-items: center; gap: 16px;
  padding: 18px 22px; border-radius: 10px;
  margin-bottom: 28px;
  border: 1px solid;
}
.banner-improve { background: #052e1622; border-color: #166534; color: #4ade80; }
.banner-regress { background: #4c000922; border-color: #9f1239; color: #f87171; }
.banner-flat    { background: var(--theme-background-alt); border-color: var(--theme-foreground-faintest); color: var(--theme-foreground-muted); }
.banner-delta   { font-size: 44px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; flex-shrink: 0; }
.banner-body    { flex: 1; }
.banner-headline { font-size: 15px; font-weight: 600; line-height: 1.4; }
.banner-tracks  { font-size: 12px; margin-top: 5px; opacity: 0.8; font-family: var(--monospace); }
.banner-meta    { text-align: right; font-size: 11px; font-family: var(--monospace); opacity: 0.55; flex-shrink: 0; line-height: 1.6; }

/* ── Track tiles ── */
.track-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px; margin-bottom: 36px;
}
.track-tile {
  background: var(--theme-background-alt);
  border: 1px solid var(--theme-foreground-faintest);
  border-radius: 8px; padding: 14px 16px;
  position: relative;
}
.track-tile-name  { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; margin-bottom: 6px; }
.track-tile-score { font-size: 36px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; margin-bottom: 4px; }
.track-tile-row   { display: flex; gap: 12px; font-size: 11.5px; color: var(--theme-foreground-muted); margin-top: 6px; }
.track-tile-delta { font-weight: 700; }
.up { color: #4ade80; }
.dn { color: #f87171; }
.tile-best-badge {
  position: absolute; top: 10px; right: 10px;
  font-size: 10px; background: #78350f33; color: #fbbf24;
  border: 1px solid #78350f88; border-radius: 4px; padding: 1px 6px; font-weight: 700;
}

/* ── Section wrappers ── */
details.section {
  border: 1px solid var(--theme-foreground-faintest);
  border-radius: 8px; margin: 20px 0; overflow: hidden;
}
details.section > summary {
  display: flex; align-items: baseline; gap: 10px;
  padding: 12px 16px; cursor: pointer; user-select: none;
  background: var(--theme-background-alt);
  border-bottom: 1px solid transparent;
  list-style: none;
}
details.section > summary::-webkit-details-marker { display: none; }
details.section[open] > summary { border-bottom-color: var(--theme-foreground-faintest); }
details.section > summary:hover { background: var(--theme-background); }
.s-arrow  { font-size: 9px; color: var(--theme-foreground-muted); transition: transform .15s; }
details.section[open] .s-arrow { transform: rotate(90deg); }
.s-title  { font-size: 14px; font-weight: 700; }
.s-hint   { font-size: 12px; font-weight: 400; color: var(--theme-foreground-muted); }
.section-body { padding: 20px; }

/* ── Color legend ── */
.legend-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; font-size: 11.5px; color: var(--theme-foreground-muted); }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: middle; margin-right: 3px; }
</style>

```js
// ── Banner ────────────────────────────────────────────────────────────────────
const odDir  = od > 0.001 ? "improve" : od < -0.001 ? "regress" : "flat";
const odSign = od > 0.001 ? "+" : "";

const movers = tracks
  .filter(t => Math.abs(d.track_deltas[t] ?? 0) >= 0.005)
  .sort((a, b) => Math.abs(d.track_deltas[b]) - Math.abs(d.track_deltas[a]))
  .map(t => {
    const dt = d.track_deltas[t];
    return `${t} ${dt > 0 ? "+" : ""}${dt.toFixed(3)}`;
  });

const overallNow = latest.overall != null ? latest.overall.toFixed(3) : "—";

display(html`<div class="banner banner-${odDir}">
  <div class="banner-delta">${od != null ? odSign + od.toFixed(3) : "—"}</div>
  <div class="banner-body">
    <div class="banner-headline">
      ${od != null
        ? `${od > 0.001 ? "Improved" : od < -0.001 ? "Regressed" : "Flat"} vs ${prev ? prev.run_short + " " + prev.run_label : "previous run"} · overall now ${overallNow}`
        : `Latest overall: ${overallNow}`}
    </div>
    ${movers.length ? html`<div class="banner-tracks">${movers.join("  ·  ")}</div>` : ""}
  </div>
  <div class="banner-meta">
    ${latest.run_short} ${latest.run_label}<br>
    ${latest.timestamp.slice(0, 10)}<br>
    v${latest.bench_v}
  </div>
</div>`);
```

```js
// ── Per-track tiles ────────────────────────────────────────────────────────────
const tiles = tracks.map(t => {
  const row = d.track_rows.find(r => r.track === t);
  if (!row) return html`<div class="track-tile"><div class="track-tile-name" style="color:${colors[t]}">${t}</div><div class="track-tile-score" style="color:var(--theme-foreground-muted)">—</div></div>`;
  const dt = row.delta;
  const dtClass = dt > 0.005 ? "up" : dt < -0.005 ? "dn" : "";
  const dtStr = dt == null ? "" : `${dt > 0 ? "+" : ""}${dt.toFixed(3)}`;
  return html`<div class="track-tile">
    ${row.is_best ? html`<div class="tile-best-badge">★ new best</div>` : ""}
    <div class="track-tile-name" style="color:${colors[t]}">${t}</div>
    <div class="track-tile-score" style="color:${scoreColor(row.latest)}">${fmtScore(row.latest)}</div>
    <div class="track-tile-row">
      <span class="track-tile-delta ${dtClass}">${dtStr || "—"}</span>
      <span>best ${fmtScore(row.best)}</span>
      <span>${row.valid_pct != null ? row.valid_pct.toFixed(0) + "% cited" : ""}</span>
    </div>
  </div>`;
});

display(html`<div class="track-grid">${tiles}</div>`);
```

## Scores over time

_Scores 0–1 across ${d.n_runs} runs. Hover a dot for details. Larger dots = latest run. Dashed line = benchmark version change._

```js
// Thin out x-axis ticks when there are many runs
const step = Math.max(1, Math.ceil(d.runs.length / 10));
const xTicks = d.runs.map((_, i) => i).filter(i => i % step === 0 || i === d.runs.length - 1);

resize(width => Plot.plot({
  width,
  height: 260,
  marginLeft: 40,
  marginBottom: 36,
  style: { background: "transparent" },
  x: {
    label: null,
    ticks: xTicks,
    tickFormat: i => d.runs[i]?.run_short ?? "",
  },
  y: { domain: [0, 1], label: null, grid: true, ticks: 5 },
  color: { domain: tracks, range: tracks.map(t => colors[t]), legend: true },
  marks: [
    Plot.ruleY([0.5, 0.75], { stroke: "var(--theme-foreground-faintest)", strokeWidth: 1 }),

    ...d.runs.reduce((acc, r, i) => {
      if (i > 0 && r.bench_v !== d.runs[i - 1].bench_v)
        acc.push(Plot.ruleX([i], { stroke: "var(--theme-foreground-muted)", strokeDasharray: "4,3", strokeWidth: 1 }));
      return acc;
    }, []),

    Plot.line(d.series, {
      x: "run_idx", y: "composite", stroke: "track",
      strokeWidth: 2.5, curve: "monotone-x", strokeLinecap: "round",
    }),
    Plot.dot(d.series, {
      x: "run_idx", y: "composite", fill: "track",
      r: r => r.is_latest ? 6 : 3,
      stroke: r => r.is_latest ? "var(--theme-background)" : null,
      strokeWidth: 2,
    }),
    Plot.tip(d.series, Plot.pointer({
      x: "run_idx", y: "composite",
      title: r => `${r.track}  ${r.composite.toFixed(3)}\n${r.run_short} ${r.run_label}\n${r.timestamp.slice(0, 10)}`,
    })),
  ],
}))
```

## Track snapshot

_Grey bar = best ever. Coloured bar = latest. Tick = previous run. Hover for full stats._

```js
const bullet = tracks.flatMap(t => {
  const row = d.track_rows.find(r => r.track === t);
  if (!row) return [];
  return [
    { track: t, kind: "best",   v: row.best   },
    { track: t, kind: "latest", v: row.latest },
    { track: t, kind: "prev",   v: row.prev   },
  ];
});

resize(width => Plot.plot({
  width,
  height: tracks.length * 52 + 44,
  marginLeft: 108,
  marginRight: 90,
  style: { background: "transparent" },
  x: { domain: [0, 1], label: null, grid: true, ticks: 5 },
  y: { domain: tracks, axis: null },
  marks: [
    Plot.barX(bullet.filter(r => r.kind === "best"), {
      y: "track", x1: 0, x2: "v",
      fill: "var(--theme-foreground-faintest)", rx: 3,
    }),
    Plot.barX(bullet.filter(r => r.kind === "latest"), {
      y: "track", x1: 0, x2: "v",
      fill: r => colors[r.track], fillOpacity: 0.8, rx: 3,
    }),
    Plot.tickX(bullet.filter(r => r.kind === "prev" && r.v != null), {
      y: "track", x: "v",
      stroke: "var(--theme-background)", strokeWidth: 3, strokeLinecap: "round",
    }),
    Plot.tickX(bullet.filter(r => r.kind === "prev" && r.v != null), {
      y: "track", x: "v",
      stroke: r => colors[r.track], strokeWidth: 1.5, strokeLinecap: "round",
    }),
    Plot.text(tracks, {
      x: 0, y: d => d,
      text: d => d, textAnchor: "end", dx: -10,
      fill: d => colors[d], fontWeight: "bold", fontSize: 12,
    }),
    Plot.text(d.track_rows, {
      y: "track", x: "latest",
      text: r => {
        const dt = r.delta;
        return fmtScore(r.latest) + (dt != null ? `  ${dt > 0 ? "+" : ""}${dt.toFixed(3)}` : "");
      },
      textAnchor: "start", dx: 7, fontSize: 11.5,
      fill: r => (r.delta ?? 0) > 0.005 ? "#4ade80" : (r.delta ?? 0) < -0.005 ? "#f87171" : "var(--theme-foreground-muted)",
      fontWeight: r => Math.abs(r.delta ?? 0) > 0.005 ? "bold" : "normal",
    }),
    Plot.tip(d.track_rows, Plot.pointerY({
      y: "track", x: "latest",
      title: r => [
        r.track,
        trackDesc[r.track] ?? "",
        "",
        `Latest   ${fmtScore(r.latest)}`,
        `Prev     ${fmtScore(r.prev)}`,
        `Delta    ${fmtDelta(r.delta)}`,
        `Best     ${fmtScore(r.best)}`,
        `Valid cite  ${fmtPct(r.valid_pct)}`,
        `Ans sup  ${fmtScore(r.ans_sup)}`,
      ].join("\n"),
    })),
  ],
}))
```

<details class="section" open>
<summary><span class="s-arrow">▶</span><span class="s-title">Item performance</span><span class="s-hint">— scores on individual questions · ★ = personal best</span></summary>
<div class="section-body">

```js
const trackFilter = view(Inputs.select(["all tracks", ...tracks], { label: "Track" }));
```

```js
const filteredItems = d.matrix
  .filter(r => r.is_latest && (trackFilter === "all tracks" || r.track === trackFilter))
  .sort((a, b) => a.composite - b.composite);

resize(width => Plot.plot({
  width,
  height: Math.max(120, filteredItems.length * 26 + 50),
  marginLeft: 200,
  marginRight: 60,
  style: { background: "transparent" },
  x: { domain: [0, 1], label: null, grid: true, ticks: 5 },
  y: { domain: filteredItems.map(r => r.item), axis: null },
  marks: [
    Plot.barX(filteredItems, {
      y: "item", x1: 0, x2: "composite",
      fill: r => colors[r.track], fillOpacity: 0.6, rx: 3,
    }),
    Plot.text(filteredItems, {
      y: "item", x: 0,
      text: r => r.item_short || r.item.replace(new RegExp("^" + r.track + "_"), "").replace(/_/g, " "),
      textAnchor: "end", dx: -6, fontSize: 11,
      fill: r => colors[r.track],
    }),
    Plot.text(filteredItems, {
      y: "item", x: "composite",
      text: r => r.composite.toFixed(2) + (r.is_best ? " ★" : ""),
      textAnchor: "start", dx: 5, fontSize: 11,
      fill: r => r.is_best ? "#fbbf24" : "var(--theme-foreground-muted)",
      fontWeight: r => r.is_best ? "bold" : "normal",
    }),
    Plot.tip(filteredItems, Plot.pointer({
      y: "item", x: "composite",
      title: r => `${r.item}  ${r.composite.toFixed(3)}${r.is_best ? "  ★ best ever" : ""}\n${r.track}`,
    })),
  ],
}))
```

**History heatmap** — each column = one run (oldest → latest), each row = one item

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
  height: hmItems.length * 22 + 56,
  marginLeft: 190,
  marginTop: 46,
  style: { background: "transparent" },
  x: { domain: runNames, axis: null },
  y: {
    domain: hmItems, axis: "left",
    tickFormat: d => d.split("/")[1].replace(/_/g, " "),
    tickSize: 0,
    label: null,
  },
  color: {
    type: "linear",
    domain: [0, 0.5, 0.65, 0.80, 1.0],
    range: ["#9f1239", "#c2410c", "#d97706", "#15803d", "#166534"],
    label: "composite",
  },
  marks: [
    Plot.cell(hmData, {
      x: "run_name", y: r => r.track + "/" + r.item,
      fill: "composite", inset: 1, rx: 2,
    }),
    Plot.text(hmData.filter(r => r.is_best), {
      x: "run_name", y: r => r.track + "/" + r.item,
      text: () => "★", fontSize: 7, fill: "#fbbf24",
    }),
    Plot.text(runNames, {
      x: d => d,
      y: () => hmItems[0],
      text: n => {
        const r = d.runs.find(r => r.name === n);
        return r?.run_short ?? n.slice(-4);
      },
      rotate: -55, textAnchor: "start",
      dy: -30, fontSize: 9,
      fill: n => n === latest.name ? "#818cf8" : "var(--theme-foreground-muted)",
      fontWeight: n => n === latest.name ? "bold" : "normal",
    }),
    Plot.tip(hmData, Plot.pointer({
      x: "run_name", y: r => r.track + "/" + r.item,
      title: r => `${r.item}  ${r.composite.toFixed(3)}${r.is_best ? "  ★" : ""}\n${r.run_short} ${r.run_label}`,
    })),
  ],
}))
```

</div>
</details>

<details class="section">
<summary><span class="s-arrow">▶</span><span class="s-title">Citation health</span><span class="s-hint">— is the agent hallucinating or misattributing sources?</span></summary>
<div class="section-body">

_**Valid** = citation found in corpus AND supported the claim. **Unsupportive** = real source but doesn't back the claim. **Fabricated** = URL not in corpus._

**Latest run — citation breakdown by track**

```js
// Build stacked bar data. valid + unsup + fab should sum to ~100%.
const citeLatest = d.track_rows.flatMap(r => [
  { track: r.track, kind: "Valid",        pct: r.valid_pct ?? 0 },
  { track: r.track, kind: "Unsupportive", pct: r.unsup_pct ?? 0 },
  { track: r.track, kind: "Fabricated",   pct: r.fab_pct   ?? 0 },
]);

resize(width => Plot.plot({
  width,
  height: tracks.length * 44 + 60,
  marginLeft: 110,
  marginRight: 60,
  style: { background: "transparent" },
  x: { domain: [0, 100], label: "% of citations", grid: true, ticks: 5 },
  y: { domain: tracks, axis: null },
  color: {
    domain: ["Valid", "Unsupportive", "Fabricated"],
    range: ["#4ade80", "#fb923c", "#f87171"],
    legend: true,
  },
  marks: [
    Plot.barX(citeLatest, Plot.stackX({
      x: "pct", y: "track", fill: "kind",
      order: ["Valid", "Unsupportive", "Fabricated"],
    })),
    Plot.text(tracks, {
      x: 0, y: d => d,
      text: d => d, textAnchor: "end", dx: -8,
      fill: d => colors[d], fontWeight: "bold", fontSize: 12,
    }),
    Plot.text(d.track_rows, {
      y: "track", x: 0,
      text: r => `${fmtPct(r.valid_pct)} valid`,
      textAnchor: "start", dx: 4, fontSize: 10,
      fill: r => (r.valid_pct ?? 0) >= 40 ? "#4ade80" : "#fb923c",
    }),
  ],
}))
```

**Valid cite% over time**

```js
resize(width => Plot.plot({
  width, height: 180,
  marginLeft: 42, marginBottom: 28,
  style: { background: "transparent" },
  x: {
    label: null,
    ticks: xTicks,
    tickFormat: i => d.runs[i]?.run_short ?? "",
  },
  y: { domain: [0, 100], label: "valid %", grid: true, ticks: 5 },
  color: { domain: tracks, range: tracks.map(t => colors[t]) },
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
      title: r => `${r.track}\nvalid ${(r.valid_rate * 100).toFixed(1)}%  fab ${((r.fab_rate ?? 0) * 100).toFixed(1)}%  unsup ${((r.unsup_rate ?? 0) * 100).toFixed(1)}%\n${r.run_short} ${r.run_label}`,
    })),
  ],
}))
```

**Answer support over time** — fraction of answer claims backed by cited evidence (higher = better)

```js
resize(width => Plot.plot({
  width, height: 180,
  marginLeft: 42, marginBottom: 28,
  style: { background: "transparent" },
  x: {
    label: null,
    ticks: xTicks,
    tickFormat: i => d.runs[i]?.run_short ?? "",
  },
  y: { domain: [0, 1], label: "ans sup", grid: true, ticks: 5 },
  color: { domain: tracks, range: tracks.map(t => colors[t]) },
  marks: [
    Plot.ruleY([0.75], { stroke: "var(--theme-foreground-faintest)" }),
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
      title: r => `${r.track}  ans sup ${r.ans_sup.toFixed(3)}\n${r.run_short} ${r.run_label}`,
    })),
  ],
}))
```

</div>
</details>

<details class="section">
<summary><span class="s-arrow">▶</span><span class="s-title">Run history</span><span class="s-hint">— most recent first</span></summary>
<div class="section-body">

```js
const histRows = [...d.runs].reverse().map(r => ({
  "#":      r.run_short ?? "—",
  label:    r.run_label ?? r.name,
  date:     r.timestamp.slice(0, 10),
  v:        r.bench_v,
  overall:  r.overall,
  ...Object.fromEntries(tracks.map(t => [t, r.tracks[t]?.composite ?? null])),
}));

Inputs.table(histRows, {
  columns: ["#", "label", "date", "v", ...tracks, "overall"],
  header: { "#": "#", label: "Run", date: "Date", v: "v", overall: "Overall" },
  format: {
    overall: v => v == null ? "—" : v.toFixed(3),
    ...Object.fromEntries(tracks.map(t => [t, v => v == null ? "—" : v.toFixed(3)])),
  },
  rows: 20,
  width: { "#": 36, date: 80, v: 44, overall: 72 },
})
```

</div>
</details>

```js
display(html`<p style="margin-top:32px;font-size:11px;color:var(--theme-foreground-faintest);font-family:var(--monospace)">
  bench v${d.versions.join(", ")} &nbsp;·&nbsp; ${d.n_runs} runs &nbsp;·&nbsp;
  <code>bench/logs/</code> &nbsp;·&nbsp; ${d.generated}
  &nbsp;·&nbsp; dev: <code>cd bench/observable && bun run dev</code>
</p>`);
```
