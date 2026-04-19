# Design Spec: TASK-7 — TrendRow + TrendSection

## Summary

TrendRow and TrendSection implement M7: trend analytics rows for Commands, Agents, and Skills on the Insights page. Each row shows a named entity (e.g. "/review", "engineer", "verification"), its total invocation count, a dual-series sparkline (teal solid = tokens in, purple dashed = tokens out across weekly buckets), and a verdict chip (IMPROVING / STABLE / REGRESSING). TrendSection is the reusable card wrapper that holds a titled list of TrendRows for a single category.

The audience is a developer who wants to understand which of their workflows are growing, stable, or declining in token cost over time. The verdict chip is the primary action signal — it must be readable without hovering.

---

## Existing Patterns Referenced

- `DeltaChip` in `InsightsPage.tsx` — exact class pattern (`text-xxs font-mono font-semibold px-1 py-0.5 rounded-dt-xs` + colour/bg-colour/10) is reused for the VerdictChip. Extend by adding a third neutral state for STABLE.
- `Sparkline.tsx` — single-series 64×20 SVG with `polyline`. TrendRow needs two series in one SVG — a new `DualSparkline` component is required (see rationale below). Do NOT modify `Sparkline.tsx`.
- `TrendChart.tsx` — two-series SVG pattern with `var(--teal)` / `var(--purple)` strokes, `vectorEffect="non-scaling-stroke"`, `strokeLinejoin="round"` — apply verbatim to DualSparkline.
- `PlaceholderCard` / section card shell in `InsightsPage.tsx` — `bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3` — TrendSection adopts this exactly.
- `HeatmapGrid.tsx` density — `text-xxs text-dt-text2` for secondary labels; applied to call-count badge.

### Why DualSparkline is a new component (not an extension of Sparkline)

`Sparkline.tsx` renders one polyline in a 64×20 viewBox and is used in `HeadlineTile` across the page. Adding an optional second series would change its prop shape and touch all existing call sites. A separate `DualSparkline` component is honest, keeps `Sparkline.tsx` unchanged, and mirrors the codebase's own convention of distinct SVG components per visual role (`Sparkline`, `TrendChart`, `HeatmapGrid`, `HourlyBars` — each is a standalone file).

---

## Component Hierarchy

```
TrendSection/
├── SectionHeader
│   ├── Title (e.g. "Commands")
│   └── CountBadge (optional: "{n} tracked")
└── TrendRowList
    └── TrendRow × n (sorted by calls desc from server)
        ├── NameCell
        ├── CallsBadge
        ├── DualSparkline
        └── VerdictChip

DualSparkline/ (standalone, used only by TrendRow)
```

---

## Props Interfaces

```typescript
// Sourced from server InsightsTrendEntry (types.ts)
type TrendVerdict = "improving" | "stable" | "regressing";

interface InsightsTrendEntry {
  name: string;
  calls: number;
  avgIn: number;
  avgOut: number;
  weekly: Array<{ in: number; out: number }>;  // per-week token totals
  verdict: TrendVerdict;
}

interface TrendRowProps {
  entry: InsightsTrendEntry;
  testId?: string;
}

interface TrendSectionProps {
  title: string;                 // "Commands" | "Agents" | "Skills"
  entries: InsightsTrendEntry[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;         // defaults to "No {title.toLowerCase()} used in this period"
  testId?: string;
  className?: string;
}

interface DualSparklineProps {
  weekly: Array<{ in: number; out: number }>;
  width?: number;     // default 80
  height?: number;    // default 24
  className?: string;
}
```

---

## State Mapping

### TrendSection States

| State | SectionHeader | TrendRowList |
|-------|--------------|--------------|
| Loading | Title rendered; CountBadge hidden | 4 skeleton rows (`h-6 bg-dt-bg2 rounded animate-pulse`) at decreasing widths |
| Empty (`entries.length === 0`) | Title rendered; CountBadge hidden | Single `text-dt-text2 text-xs font-mono` line with `emptyMessage` |
| Error | Title rendered | Error banner: `border-dt-red/40 text-dt-red text-xs font-mono p-2 rounded-dt`, `role="alert"` |
| Populated | Title + `CountBadge "{n} tracked"` | All TrendRow items |

### TrendRow States

TrendRow has no independent loading/error state — it is always rendered in the Populated state of its parent TrendSection. Its only variants are driven by data:

| Variant | Condition | Rendered difference |
|---------|-----------|---------------------|
| Single week | `entry.weekly.length === 1` | DualSparkline renders two horizontal midpoint lines (degenerate case — no trend visible) |
| All zeros | All `weekly[i].in === 0 && weekly[i].out === 0` | DualSparkline hidden, replaced by `text-dt-text2 text-xxs font-mono "—"` |
| Normal | `weekly.length >= 2` with non-zero values | Full DualSparkline |

### DualSparkline States

| State | Render |
|-------|--------|
| `weekly.length === 0` | `null` — render nothing |
| `weekly.length === 1` | Two horizontal lines at vertical midpoints (static fallback) |
| `weekly.length >= 2`, all values zero | Empty viewBox (returns `null`) |
| `weekly.length >= 2`, non-zero | Full two-series polyline |

---

## DualSparkline Specification

**Purpose:** Show the weekly trend of tokens in and tokens out for one entity in a 80×24 SVG. Teal solid = tokens in (contextual load, correlates to how much the model was "reading"). Purple dashed = tokens out (generation effort, correlates to how much the model was "writing").

**Default dimensions:** `viewBox="0 0 80 24"`, width 80, height 24. Rendered at `w-20 h-6` via Tailwind classes.

**Padding:** 2px on all sides. Chart area is therefore 76×20.

**Point computation:**
```
CHART_W = width - 4    (pad*2)
CHART_H = height - 4
n = weekly.length

For each series (in/out):
  values = weekly.map(w => w.in)  OR  weekly.map(w => w.out)
  max = Math.max(all in and out values combined, 1)  // shared scale for comparability
  xs[i] = 2 + (i / (n - 1)) * CHART_W
  ys[i] = 2 + CHART_H - (values[i] / max) * CHART_H
```

**Important:** Both series share the same y-scale (`max` is the maximum across ALL in + out values). This lets the reader compare series magnitudes — if tokens-in dominates, the teal line sits higher; tokens-out is proportionally smaller. Using independent y-scales per series would misrepresent the ratio.

**SVG element structure:**
```xml
<svg viewBox="0 0 80 24" aria-label="{label}" role="img" className={className}>
  <!-- Teal solid line: tokens in -->
  <polyline
    points={insPoints}
    fill="none"
    stroke="var(--teal)"
    strokeWidth="1.5"
    strokeLinejoin="round"
    strokeLinecap="round"
    vectorEffect="non-scaling-stroke"
  />
  <!-- Purple dashed line: tokens out -->
  <polyline
    points={outPoints}
    fill="none"
    stroke="var(--purple)"
    strokeWidth="1.5"
    strokeDasharray="3 2"
    strokeLinejoin="round"
    strokeLinecap="round"
    vectorEffect="non-scaling-stroke"
  />
</svg>
```

**Stroke dash:** The purple dashed line uses `strokeDasharray="3 2"` (3px dash, 2px gap). At this scale (80px wide, up to ~7 weekly buckets) each segment is ~11px, so approximately two dash cycles per segment — clearly distinguishable from the solid teal line at a glance.

**`aria-label` content:** `"Weekly token trend: {entry.name}. Tokens in trend (teal). Tokens out trend (purple dashed)."` This tells screen readers what the visual encodes without enumerating every data point.

---

## TrendRow Specification

**Layout:** `flex items-center gap-3 py-1.5 border-b border-dt-border last:border-b-0`

**Columns (left to right):**

1. **NameCell** — `flex-1 min-w-0`. Text: `text-xs font-mono text-dt-text1 truncate`. For commands, name is already "/" prefixed (e.g. "/review"). For agents, display as-is (e.g. "engineer"). For skills, display as-is (e.g. "verification"). No transformation needed; server provides display-ready names.

2. **CallsBadge** — `text-xxs font-mono text-dt-text2 flex-shrink-0`. Format: `{calls}×`. Displays total invocations for the period. Example: "42×". No full-word "calls" label needed at this density.

3. **DualSparkline** — `flex-shrink-0`. Renders at `w-20 h-6`. Hidden (returns null) when all weekly values are zero.

4. **VerdictChip** — `flex-shrink-0`. See VerdictChip spec below.

**Row height:** Minimum `min-h-[28px]`. Touch target is not applicable (rows are display-only, not interactive).

---

## VerdictChip Specification

**Base classes (match DeltaChip exactly):** `text-xxs font-mono font-semibold px-1 py-0.5 rounded-dt-xs`

**Verdict-to-style mapping:**

| `verdict` | Text | Text class | Background class | `aria-label` suffix |
|-----------|------|-----------|-----------------|-------------------|
| `"improving"` | `IMPROVING` | `text-dt-green` | `bg-dt-green/10` | "trend improving" |
| `"stable"` | `STABLE` | `text-dt-text2` | `bg-dt-bg2` | "trend stable" |
| `"regressing"` | `REGRESSING` | `text-dt-red` | `bg-dt-red/10` | "trend regressing" |

**Width note:** `REGRESSING` is the longest string (10 chars). At `text-xxs font-mono` (8px) with `px-1` (4px padding each side), the chip is approximately 88px wide. This is wider than the `+XX.X%` format of `DeltaChip`. The Engineer should verify the row layout still holds at 320px mobile width — if not, add `min-w-0` to NameCell and allow it to truncate before the chip clips.

**ARIA:** `<span aria-label="{entry.name} {ariaLabelSuffix}">IMPROVING</span>`. The chip must not rely on colour alone to convey verdict — the text inside the chip makes it colour-independent.

---

## TrendSection Specification

**Outer wrapper:** `bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3` — identical to all other section cards on the page.

**SectionHeader:** `flex items-center justify-between`
- Left: `text-md font-semibold text-dt-text2 font-mono tracking-wide` — matches "Token Usage Trend" and other section headers in `InsightsPage.tsx`
- Right: CountBadge `text-xxs font-mono text-dt-text2` — displays `"{n} tracked"` when populated; hidden when loading or empty

**TrendRowList:** `flex flex-col` — rows are stacked vertically with no container padding. Border-bottom on each row (except last) provides visual separation.

**Empty message:** `text-dt-text2 text-xs font-mono py-2 text-center` — centred for visual balance when there are no rows.

**Maximum rows rendered:** Server returns max 20 per category. If more than 10 rows, show a "Show more" text button at the bottom: `text-dt-accent text-xxs font-mono cursor-pointer hover:underline`. (The Engineer should implement this as local state toggling between slice 0..10 and full array.)

---

## Interaction Flow

```
InsightsPage renders with loading=true
  → All three TrendSections (Commands, Agents, Skills) show skeleton rows

Data arrives (InsightsTrends object)
  → commands.length === 0 → Commands TrendSection shows empty message
  → agents.length === 0 → Agents TrendSection shows empty message
  → skills populated → Skills TrendSection renders rows

Per row:
  → DualSparkline is visible if weekly data is non-trivially non-zero
  → VerdictChip is always visible (stable is the neutral state)
  → If > 10 rows: only first 10 shown, "Show more" toggle at bottom
  → Clicking "Show more": renders remaining rows with smooth height expansion
    (CSS: transition-all duration-200 ease-out on the container)

Error:
  → Each TrendSection independently can show error (if per-endpoint error)
  → OR a single error banner at the parent level if the entire /trends endpoint fails
```

---

## Responsive Breakpoints

**TrendSection** is a single-column card — it spans the full content width at all breakpoints.

**TrendRow** columns at narrow widths:

| Breakpoint | NameCell | CallsBadge | DualSparkline | VerdictChip |
|------------|---------|-----------|--------------|-------------|
| < 640px (mobile) | Truncates aggressively | Shown | Shown (80px is fine even at 320px) | Shown (chip wraps to next line if needed) |
| >= 640px | Normal truncate | Shown | Shown | Shown, always on same line |

At 320px, a row with name "verification", "42×", sparkline (80px), and "REGRESSING" chip (88px estimated) totals roughly: flexible name + 30px badge + 80px sparkline + 88px chip + gaps = ~230px of fixed content. Name gets ~90px, which fits "verificat…" with truncation. This is acceptable.

**Three TrendSections** in `InsightsPage.tsx` are placed as three separate cards in the vertical flow (Commands, then Agents, then Skills). They are NOT a horizontal three-column layout — each is full-width. This matches the existing InsightsPage layout pattern where every section is a full-width card.

---

## Accessibility Checklist

- [ ] `DualSparkline` has `role="img"` and descriptive `aria-label` (see spec above)
- [ ] `VerdictChip` text is inside `<span>` — colour is supplementary, not the sole signal
- [ ] `VerdictChip` has `aria-label` on the `<span>` element that includes both name and verdict for full context
- [ ] Empty and error messages use appropriate roles (`role="alert"` for error)
- [ ] Loading skeleton: `aria-busy="true"` on the `TrendSection` root during loading state
- [ ] "Show more" button uses `<button type="button">` — keyboard accessible (Enter/Space activates)
- [ ] Focus order follows visual order (name → calls → sparkline → chip)
- [ ] `DualSparkline` is `aria-hidden="true"` at mobile sizes if call count and verdict fully substitute — decision deferred to Engineer based on final layout, but the aria-label on the SVG means it is safe to leave visible for AT users
- [ ] Reduced motion: no animations on TrendRow itself. The "Show more" height transition is covered by the existing `@media (prefers-reduced-motion)` rule in `globals.css`

---

## Wireframe

### TrendSection (populated, Commands example):

```
┌──────────────────────────────────────────────────────────────────┐
│  Commands                                        7 tracked        │
├──────────────────────────────────────────────────────────────────┤
│  /review        42×  [─────╮ · · · ·]  [IMPROVING ]             │
│  /build         28×  [─────╮ · · · ·]  [STABLE    ]             │
│  /test          19×  [─────╮ · · · ·]  [STABLE    ]             │
│  /deploy         7×  [─────╮ · · · ·]  [REGRESSING]             │
│  /plan           3×  [─────╮ · · · ·]  [STABLE    ]             │
│                                               Show more          │
└──────────────────────────────────────────────────────────────────┘

Legend for sparkline: ─── teal solid = tokens in  · · · purple dashed = tokens out
```

### DualSparkline (zoomed, 80×24 concept):

```
24 ┤  ╭────╮                    (teal solid = tokens in)
   │  │    ╰────╮
 0 ┤  ·····╮    ╰────────       (purple dashed = tokens out)
   └──┬───┬───┬───┬───┬──
     W1  W2  W3  W4  W5
```

### VerdictChip variants:

```
[IMPROVING ]   ← green text, green/10 bg
[STABLE    ]   ← text-2 (muted), bg-2
[REGRESSING]   ← red text, red/10 bg
```

---

## Implementation Notes for Engineer

- **Do not modify `Sparkline.tsx`**. Create `DualSparkline.tsx` as a new file in `dashboard/src/components/insights/`.
- Shared y-scale in DualSparkline: `const maxVal = Math.max(...weekly.flatMap(w => [w.in, w.out]), 1)` — max across all individual in and out values so both lines share a reference frame. Do NOT sum in+out per bucket (that would be a stacked-chart max and would compress both lines to ~50% of chart height). Do NOT normalise each series independently.
- `strokeDasharray="3 2"` on the purple (out) polyline — sufficient to distinguish at 80px width with up to ~12 weekly buckets. At 4–7 buckets (typical 7d–30d), the dashes are clearly visible.
- The `weekly` array length determines the number of x-axis points. `weekly.length === 0` means the entry exists but has no time-series data — render nothing. `weekly.length === 1` is possible when the entire selected period is one week bucket — render a horizontal line at the mid-y.
- VerdictChip neutral state (STABLE): use `bg-dt-bg2` not `bg-dt-text2/10`. `dt-bg2` is the existing card surface colour; it creates a subtle inset look that reads as "no signal" without adding visual noise.
- `TrendSection` test IDs must match the existing placeholder test IDs in `InsightsPage.tsx`: `section-card-commands`, `section-card-agents`, `section-card-skills`.
- "Show more" toggle: threshold is 10 rows. If `entries.length <= 10`, the button does not render at all (no empty space).
- CallsBadge format `"{calls}×"` uses the multiplication sign character `×` (U+00D7), not an `x` character. This matches the visual density conventions in the existing `font-mono` number display.
- Edge case: verdict is `"stable"` for all entries in a section — the section should not visually alarm the user. The muted `STABLE` chip style achieves this.
- Edge case: `entry.weekly` is an empty array from server — DualSparkline returns `null`; a `"—"` text placeholder fills the gap in the row layout.
- Edge case: name field is very long (e.g. a skill named "my-very-long-skill-identifier") — `truncate` on NameCell handles this; verify at 320px.
