# Brainstorm: ECharts for Insights Dashboard

**Date:** 2026-04-19
**Input type:** Idea
**Input:** i want to use ECChart to build graph, comlumn, trend, dashboard to achieve grafna but no overengieneer

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Current charts are insufficient | CONFIRMED | All 4 chart components are hand-rolled SVG — no hover tooltips, no zoom, no crosshair |
| ECharts can replace all current charts | QUESTIONED | Sparklines at 60×24px are overkill for ECharts — hand-rolled SVG is better there |
| "Like Grafana" means building a dashboard framework | QUESTIONED | Grafana's value is interactive charts + time range sync, not the panel builder itself |
| ECharts bundle size is acceptable | QUESTIONED | Tree-shaken for 3 chart types ≈ 95KB gzipped — acceptable for a dev dashboard |
| We need a generic panel/datasource system | QUESTIONED | No — "no overengineering" means swap chart components, not build a framework |

## Fundamentals

**Current chart inventory (verified in code):**
- `Sparkline.tsx` — hand-rolled SVG, 60×24px, static. Used in 4 HeadlineTiles.
- `TrendChart.tsx` — hand-rolled SVG dual-line chart, hourly tokensIn/Out, no tooltip
- `HeatmapGrid.tsx` — CSS grid 7×24 colored cells, no tooltip
- `HourlyBars.tsx` — CSS flex bar chart, no tooltip

**What "Grafana-like" fundamentally means:**
- Hover tooltip with exact values
- Crosshair sync across panels
- Professional rendering
- Optional zoom/pan on time series

**ECharts value per chart:**
- Line (TrendChart) — HIGH: tooltip, crosshair, smooth curves, dataZoom slider
- Heatmap (HeatmapGrid) — HIGH: built-in heatmap + visualMap legend + tooltip
- Bar (HourlyBars) — MEDIUM: tooltip + better axis labels
- Sparkline — LOW: too small, hand-rolled SVG is fine

**Bundle cost:** Tree-shaken LineChart + BarChart + HeatmapChart + supporting components ≈ 280KB raw, 95KB gzipped.

## Output

**Verdict: YES — validated, with tight scope.**

### Architecture

1 shared wrapper: `dashboard/src/components/insights/EChartsWrapper.tsx`
- ~40 lines: useRef → echarts.init → setOption → ResizeObserver cleanup
- No `echarts-for-react` — direct echarts API

3 chart replacements:
- `TrendChart.tsx` → ECharts line chart with tooltip + crosshair + optional dataZoom
- `HeatmapGrid.tsx` → ECharts heatmap with visualMap + hover tooltip
- `HourlyBars.tsx` → ECharts bar chart with tooltip

1 untouched: `Sparkline.tsx` (too small)

### What stays the same
- Insights page layout
- Data hooks (useInsightsActivity, useInsightsAggregate, etc.)
- Time range filter
- dt-* Tailwind tokens on surrounding UI

### Theme integration
ECharts supports a custom theme object — inject `--bg`, `--accent`, `--teal`, `--purple`, `--text0`, `--border` CSS vars into ECharts backgroundColor/textStyle/etc. so charts respect dark/light mode.

### Installation
```bash
pnpm add echarts
```
Tree-shake:
```ts
import { use } from 'echarts/core';
import { LineChart, BarChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
use([LineChart, BarChart, HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, DataZoomComponent, CanvasRenderer]);
```

### Explicitly out of scope
- Panel drag-and-drop builder
- Custom datasource plugins
- Alert thresholds
- Multi-dashboard routing

## Next Steps

`/mas:dev-loop implement ECharts chart replacement for TrendChart, HeatmapGrid, HourlyBars — see docs/brainstorms/2026-04-19-echarts-insights-charts.md`
