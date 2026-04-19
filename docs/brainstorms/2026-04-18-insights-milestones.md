# Brainstorm: Insights view — milestone decomposition

**Date:** 2026-04-18
**Input type:** Idea
**Input:** Break implementation of `ui_kits/insights.html` into multiple milestones

## Assumptions

| Assumption | Status | Evidence |
|---|---|---|
| Insights reads from the same JSONL source as session view | CONFIRMED | Architecture invariant #1 — JSONL is source of truth |
| Aggregation must be computed server-side | CONFIRMED | Invariant #4 — `computeMetrics()` on server, dashboard gets pre-computed |
| No existing cross-session aggregate endpoint | CONFIRMED | `server/src/http/routes/` has nothing named `insights` or `aggregate` |
| `cost-aggregator.ts` is reusable as incremental per-session foundation | CONFIRMED | Offset-based cache already exists; needs a cross-session layer on top |
| Charts are hand-rolled SVG — no chart library needed | CONFIRMED | `ui_kits/insights.html` is entirely inline SVG; no Recharts/Chart.js in package.json |
| Time-series (daily/hourly bucket) data doesn't exist yet | CONFIRMED | No `timeseries` module in `server/src/analyzer/` |
| Per-command/agent/skill trend tracking doesn't exist yet | CONFIRMED | `tool-stats.ts` counts tools globally, not bucketed by time window |

## Fundamentals

### What is actually being built

1. **New React route** — `/insights` lazy-loaded page in TanStack Router
2. **New server endpoints** — cross-session aggregators (not per-session)
3. **SVG chart components** — driven by real data, reusing design tokens from `globals.css`

### Dependency graph

```
M1 — Route shell + Titlebar nav
  └─ unblocks all frontend work

M2 — Aggregate API (cross-session totals + time-series)
  └─ unblocks M3, M4, M5, M6, M7

M3 — Headline/secondary stats + scope bar (wired to M2)
M4 — Token trend chart + sparklines (needs M2 timeseries)
M5 — Heatmap + hourly distribution (needs M2 activity buckets)
M6 — Model mix + top consumers (needs M2 breakdown)
M7 — Commands / Agents / Skills trends (needs M2 + new per-entity series)
M8 — Efficiency hints (needs M7 patterns)
```

### Risk profile

| Milestone | Effort | Risk | Reason |
|---|---|---|---|
| M1 | 1–2h | Low | Route + nav toggle only |
| M2 | 4–6h | Medium | First cross-session aggregation; must not block reads |
| M3 | 3–4h | Low | Standard stat tiles, scope bar state |
| M4 | 3–4h | Low | SVG charts, known data shape |
| M5 | 3–4h | Low | Existing session data, new bucketing |
| M6 | 4–5h | Low | Model breakdown from result events; tool stats exist |
| M7 | 4–6h | Medium | Per-entity time-bucketed trends; new query pattern |
| M8 | 2–3h | Medium | Rule logic is subjective; correctness hard to verify |

## Output — Milestone Definitions

---

### M1 · Route shell + Titlebar nav
**Goal:** `/insights` exists as a navigable page. No data yet.

**Server:** nothing

**Dashboard:**
- Add `/insights` route to `router.ts` (lazy `InsightsPage`)
- Create `dashboard/src/routes/InsightsPage.tsx` — page chrome only (scope bar skeleton, empty card placeholders)
- Update `Titlebar.tsx` — add `Session · Insights` segmented nav pill (same `.nav-seg` pattern from `insights.html`)
- Active pill switches to accent color when on `/insights`

**Done when:** clicking "Insights" in titlebar navigates to the page and clicking "Session" goes back.

---

### M2 · Aggregate API — cross-session totals + time-series
**Goal:** Single endpoint returns everything needed for headline stats, sparklines, and the trend chart.

**Server — new file `server/src/analyzer/insights-aggregator.ts`:**
```
GET /api/insights/aggregate?timeRange=7d&repo=all
→ {
    tokensIn, tokensOut, cost, sessions, turns,
    avgCostPerTurn, avgTokensPerTurn, activeDays,
    peakHour,
    // time-series for sparklines + trend chart:
    daily: Array<{ date, tokensIn, tokensOut, cost }>
  }
```
- Iterates `discoverSessions()`, filters by `cwd`/`startTime`, aggregates via `cost-aggregator`
- `daily[]` bucketed by UTC day from `session.startTime`
- Stat-based cache: recompute only when any session file changes
- `timeRange` options: `24h | 7d | 30d | 90d | all`
- `repo` options: `all | <repoSlug>`

**Done when:** `curl /api/insights/aggregate?timeRange=7d` returns correct numbers matching `pnpm -C server test`.

---

### M3 · Headline stats + secondary stats + scope bar
**Goal:** Top 9 stat tiles render real data; scope bar switches actually filter.

**Dashboard:**
- `InsightsPage.tsx`: fetch from M2 endpoint on mount + on seg change
- Render 5 headline tiles (big: tokensIn/tokensOut with sparkline mini-SVG; standard: cost/sessions/turns)
- Render 4 secondary tiles (avgCostPerTurn, avgTokensPerTurn, activeDays, peakHour)
- Delta chips computed as `(current - prev) / prev` between the selected window and the window before it
- Scope bar: repo seg + time-range seg update query params, refetch

**Done when:** Changing "7d → 30d" updates all tile values and deltas.

---

### M4 · Token trend chart + sparklines
**Goal:** Full-width stacked area chart and headline-tile sparklines show real time-series.

**Data source:** `daily[]` array from M2 aggregate endpoint.

**Dashboard:**
- `TrendChart.tsx` — SVG stacked area (teal input, purple output) with grid lines + day labels
- ViewBox scales to container width using `preserveAspectRatio="none"`
- Sparklines in Tokens in / Tokens out tiles use the last N days from `daily[]`
- Y-axis domain auto-computed from `max(tokensIn + tokensOut)`

**Done when:** Chart shows correct daily shapes; zooming time range (7d → 30d) redraws chart.

---

### M5 · Heatmap + hourly distribution
**Goal:** "When you work" card shows real activity patterns.

**Server — new endpoint:**
```
GET /api/insights/activity?timeRange=7d&repo=all
→ {
    heatmap: Array<{ day: 0-6, hour: 0-23, intensity: 0-4 }>,
    hourly: Array<{ hour: 0-23, tokensAvg: number }>
  }
```
- `day` = weekday index (0=Mon); `hour` = UTC hour
- `intensity` normalized to 0–4 from token volume
- `peakCell` flagged separately

**Dashboard:**
- `HeatmapGrid.tsx` — 7×24 CSS grid, cells colored by intensity class
- `HourlyBars.tsx` — 24-bar SVG chart, peak bars in accent color
- Observation sentence: "You do X% of your work between H1 and H2"

**Done when:** Heatmap cells reflect actual session start times from JSONL.

---

### M6 · Model mix + top consumers
**Goal:** Model breakdown and top repo/session/tool cards show real ranked data.

**Server — new endpoint:**
```
GET /api/insights/breakdown?timeRange=7d&repo=all
→ {
    models: Array<{ model, tokensIn, tokensOut, cost, turns, share }>,
    topRepos: Array<{ slug, tokens, cost }>,
    topSessions: Array<{ id, label, cost }>,
    topTools: Array<{ name, calls }>
  }
```
- Model data from `result.modelUsage` on each session
- topSessions sorted by `cost`, topTools from `tool-stats.ts`

**Dashboard:**
- `ModelMix.tsx` — stacked proportion bar + model row cards (big mono in/out numbers)
- `TopConsumers.tsx` — 3-column rank grid with accent bars

**Done when:** Model share percentages sum to 100%; top sessions match most expensive in session list.

---

### M7 · Commands / Agents / Skills trend rows
**Goal:** Per-entity rank lists + dual sparklines + IMPROVING/STABLE/REGRESSING verdicts.

**Server — new endpoint:**
```
GET /api/insights/trends?timeRange=7d&repo=all
→ {
    commands: Array<{ name, calls, avgIn, avgOut, weekly: Array<{in,out}>, verdict }>,
    agents:   Array<{ name, runs,  avgIn, avgOut, weekly: Array<{in,out}>, verdict }>,
    skills:   Array<{ name, runs,  avgIn, avgOut, weekly: Array<{in,out}>, verdict }>
  }
```
- `verdict` = `improving | stable | regressing` based on linear regression slope of `avgIn + avgOut` over the weekly windows
- Commands detected from `user` events starting with `/`
- Agents from `agent_start` events (subagent names)
- Skills from tool calls named `Skill`

**Dashboard:**
- `TrendSection.tsx` — reusable rank list + trend list card (used for all 3)
- Dual sparklines (teal solid + purple dashed polyline SVG)
- Verdict chip colored by verdict

**Done when:** SWE agent that improved shows IMPROVING; /review that grew shows REGRESSING.

---

### M8 · Efficiency hints
**Goal:** 6 advisory cards based on real patterns.

**Server — compute as part of `/api/insights/aggregate` response:**
```
hints: Array<{ id, severity: 'warn'|'good'|'info', title, body }>
```
Rules:
1. Long-context dominance — % of turns starting above 80K tokens
2. Read tool overuse — Read% of total tool calls > 40%
3. Haiku savings — identify agents/skills on expensive models with low complexity
4. Opus concentration — % of spend on Opus vs % of turns
5. Tightening trend — if avg tokens/turn fell >2% vs prior window
6. Fun metric — total output tokens in "Harry Potter book equivalents" (1.08M tokens/book)

**Dashboard:**
- `EfficiencyHints.tsx` — 3-column grid, icon + severity color from CSS vars
- Hints with `warn` severity always shown first

**Done when:** Long-context hint fires when >30% of turns exceed 80K context.

---

## Implementation Order

```
M1 → M2 → M3 + M4 + M5 (parallel) → M6 → M7 → M8
```

M3/M4/M5 can ship independently after M2; M6 ships after M2; M7 after M2; M8 after M7.

Each milestone is independently shippable with a feature flag or behind the `/insights` route (users only see it when they navigate there).

## Next Steps

`/mas:dev-loop implement insights view — see docs/brainstorms/2026-04-18-insights-milestones.md`

Or pick a single milestone:
`/mas:dev-loop implement M1 insights route shell — see docs/brainstorms/2026-04-18-insights-milestones.md`
