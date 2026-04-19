# Design Spec: TASK-5 — ModelMix

## Summary

ModelMix is a card-level section on the Insights page that visualises how token spend is distributed across Claude models during the selected time range. The primary audience is a developer who wants to understand whether they are spending on Opus, Sonnet, or Haiku and at what scale. Scanability is the key success criterion: the proportion bar delivers a full picture in under one second; the row cards supply the precise numbers.

---

## Existing Patterns Referenced

- `PlaceholderCard` in `InsightsPage.tsx` — card shell (`bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3`) adopted directly as outer wrapper
- `DeltaChip` in `InsightsPage.tsx` — colour + bg pattern (`text-dt-green bg-dt-green/10`, `text-dt-red bg-dt-red/10`, `text-xxs font-mono font-semibold px-1 py-0.5 rounded-dt-xs`) extended for share percentage badges
- `TrendChart.tsx` — SVG area fill approach using `var(--teal)` / `var(--purple)` with `fillOpacity="0.25"` and `vectorEffect="non-scaling-stroke"` is the established pattern for proportion fills; the proportion bar adapts it to a horizontal rect strip
- `HeatmapGrid.tsx` — `INTENSITY_CLASS` map pattern for assigning distinct token colour per model position (index 0..n-1 maps to teal/purple/accent/green/yellow)
- Skeleton pattern: `animate-pulse` on a fixed-height `div` with `bg-dt-bg1 border border-dt-border rounded-dt`

---

## Component Hierarchy

```
ModelMixCard/
├── CardHeader
│   ├── Title ("Model Mix")
│   └── Legend (inline colour swatches + model short names)
├── ProportionBar  ← SVG, single horizontal stacked bar
└── ModelRowList
    └── ModelRow (one per model, sorted by cost desc)
        ├── ColourDot
        ├── ModelName (truncated)
        ├── TokenNumbers (in / out, big mono)
        └── ShareBadge
```

---

## Props Interface

```typescript
// Sourced from server InsightsBreakdown.models (types.ts)
interface InsightsModelEntry {
  model: string;       // "claude-sonnet-4-6", "claude-opus-4-5", etc.
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
  share: number;       // 0-100, percent of total cost
}

interface ModelMixProps {
  models: InsightsModelEntry[];   // sorted by cost desc, already computed server-side
  loading?: boolean;
  error?: string | null;
  className?: string;
  testId?: string;
}
```

---

## State Mapping

| State | ProportionBar | ModelRowList | Notes |
|-------|--------------|--------------|-------|
| Loading | Single `h-4 animate-pulse rounded-full bg-dt-bg2` strip | 3 skeleton rows (`h-6 bg-dt-bg2 rounded animate-pulse`) | Width 100% for bar, staggered rows at w-full / w-4/5 / w-3/5 |
| Empty (`models.length === 0`) | Hidden | Centred `text-dt-text2 text-xs font-mono` message: "No model data for this period" | No proportion bar rendered |
| Error | Hidden | Error banner matching existing `insights-error` pattern: `border-dt-red/40 text-dt-red` | Show `error` prop message |
| Populated | Full SVG stacked bar | All ModelRow items | Primary state |
| Single model | Full width single-colour bar | One row, share badge shows "100%" | Edge case; must not crash |

---

## ProportionBar Specification

**Purpose:** Immediately show the relative cost share of each model in a single glance.

**SVG dimensions:** `viewBox="0 0 400 16"`, `preserveAspectRatio="none"`, rendered at `w-full h-4`. No padding; segments span the full width end-to-end.

**Layout:** Each model occupies a horizontal rect with width proportional to `share`. Segments are contiguous — no gap between them. Left-to-right order follows the sorted `models` array (highest share first).

**Colours:** Assign from a fixed palette by index position (not by model name, as model IDs may vary):
- Index 0: `var(--teal)` at full opacity
- Index 1: `var(--purple)` at full opacity
- Index 2: `var(--accent)` at full opacity
- Index 3: `var(--green)` at full opacity
- Index 4: `var(--yellow)` at full opacity
- Index 5+: `var(--text-2)` at full opacity

**Rounding:** First segment has `rx="4"` on left corners only; last segment has `rx="4"` on right corners only; middle segments have `rx="0"`. If only one model, full `rx="4"`.

**Accessibility:**
- `role="img"` on the `<svg>`
- `aria-label` computed as: `"Model cost distribution: {model1} {share1}%, {model2} {share2}%, ..."` — enumerates all models so screen readers get the full breakdown
- Segments themselves are `<rect>` elements with no individual ARIA needed; the parent label covers them

**Hover (populated state):** Each segment `<rect>` receives a `<title>` child element containing `"{modelShortName}: {share.toFixed(1)}% of cost"`. This enables native browser tooltip on hover without JavaScript.

**SVG structure (pseudocode):**
```
<svg viewBox="0 0 400 16" preserveAspectRatio="none" role="img" aria-label="...">
  {models.map((m, i) => {
    xOffset = sum of previous shares * 4  // 400px total
    width = m.share * 4
    <rect x={xOffset} y={0} width={width} height={16} fill={PALETTE[i]} rx={...}>
      <title>{shortName}: {share.toFixed(1)}%</title>
    </rect>
  })}
</svg>
```

---

## ModelRow Specification

**Layout:** `flex items-center gap-3` row inside a `flex flex-col gap-1.5` list.

**Columns (left to right):**
1. `ColourDot` — 8×8 `rounded-full` filled with the palette colour for that index. `flex-shrink-0`.
2. `ModelName` — truncated model string. Strip "claude-" prefix and replace "-" with " " for display (e.g. "claude-sonnet-4-6" → "sonnet 4-6"). `text-xs font-mono text-dt-text1 truncate min-w-0 flex-1`.
3. `TokenNumbers` — right-aligned pair `text-xs font-mono text-dt-text0`. Format: `{formatTokens(tokensIn)} in / {formatTokens(tokensOut)} out`. Use the existing `formatTokens()` from `lib/cost.ts`.
4. `ShareBadge` — `text-xxs font-mono font-semibold px-1 py-0.5 rounded-dt-xs` with `text-dt-teal bg-dt-teal/10` for index 0, `text-dt-purple bg-dt-purple/10` for index 1, `text-dt-accent bg-dt-accent/10` for index 2, etc., matching palette. Displays `"{share.toFixed(1)}%"`.

**Separator:** A `border-t border-dt-border` after the proportion bar but before the model list, or a `gap-3` between sections. Do not add inter-row separators; vertical rhythm via `gap-1.5` is sufficient.

**Touch target:** The row is display-only (not clickable) in the M6 spec. No `button` role; no keyboard focus needed.

---

## Interaction Flow

```
InsightsPage renders with loading=true
  → ModelMixCard shows skeleton bar + 3 skeleton rows

Data arrives (models array)
  → If models.length === 0
      → Empty state message, no bar
  → If models.length >= 1
      → ProportionBar renders with smooth layout
      → ModelRowList renders, one row per model
      → Hovering a bar segment shows title tooltip

Error state
  → Error banner, bar and rows hidden
```

---

## Responsive Breakpoints

| Breakpoint | Behaviour |
|------------|-----------|
| < 640px (mobile) | TokenNumbers shown on a second line below ModelName, ShareBadge moves to first-line right end. Achieved by `flex-wrap` on the row. |
| 640–1024px (tablet) | Single-line row: name, tokens, badge all on one line |
| > 1024px (desktop) | Same as tablet; card spans full content-area width (up to `max-w-screen-xl`) |

The card always spans 100% of its grid column; no fixed width. TokenNumbers text may be too wide at 320px — `min-w-0` on the name cell allows it to truncate before numbers.

---

## Accessibility Checklist

- [ ] `<svg>` ProportionBar has `role="img"` and descriptive `aria-label` enumerating all models and shares
- [ ] No information conveyed by colour alone: share percentage is shown numerically in ShareBadge
- [ ] ColourDot is `aria-hidden="true"` (decorative)
- [ ] Error banner uses `role="alert"`
- [ ] Loading skeleton uses `aria-busy="true"` on the card root
- [ ] Colour contrast: `dt-text1` on `dt-bg1` — confirm ≥ 4.5:1 in both light and dark themes (teal and purple on bg1 already pass in the existing TrendChart usage)
- [ ] Reduced motion: `animate-pulse` already gated by `@media (prefers-reduced-motion: reduce)` in `globals.css` — no additional work needed

---

## Wireframe

```
┌─────────────────────────────────────────────────────────┐
│  Model Mix                              [legend: ■ sonnet 4-6  ■ opus-4]
├─────────────────────────────────────────────────────────┤
│  [■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■][■■■■■][■■]      │  ← ProportionBar (teal / purple / accent)
├─────────────────────────────────────────────────────────┤
│  ● sonnet 4-6       24.5M in / 8.2M out         67.3%  │
│  ● opus-4            3.1M in / 1.0M out         22.1%  │
│  ● haiku-4-5         0.8M in / 0.3M out         10.6%  │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Notes for Engineer

- Model short name helper: `model.replace(/^claude-/, "").replace(/-(\d)/, " $1")` — gives "sonnet 4-6", "opus-4-5", "haiku-4-5" etc.
- `formatTokens()` is already exported from `dashboard/src/lib/cost.ts` — import it; do not duplicate.
- Proportion bar x-offset must be computed as a running sum: `let x = 0; models.forEach(m => { draw rect at x; x += m.share * (400/100); })`. Floating-point accumulation may leave a 1px gap at the right edge; clamp `width = Math.min(width, 400 - x)` for the last segment.
- The `PALETTE` array is local to `ModelMix.tsx`; do not expose it globally. If a future component needs it, extract then.
- The card uses the existing `bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3` shell — identical to `PlaceholderCard`. The `section-card-model-mix` test ID on the existing placeholder card in `InsightsPage` must be transferred to this component (`data-testid="section-card-model-mix"`).
- Edge case to test: `models` array with a single entry — bar should fill 100% with full rounding on both sides.
- Edge case to test: model with `share = 0` — skip that segment entirely (zero-width rect would break rounded corners logic).
- Edge case to test: `models` array with 6+ entries — palette falls back to `dt-text2` for index ≥ 5.
