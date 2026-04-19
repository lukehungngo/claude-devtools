# Design Spec: TASK-6 — TopConsumers

## Summary

TopConsumers is a card-level section on the Insights page that presents three ranked lists side-by-side: Top Repos (by cost), Top Sessions (by cost), and Top Tools (by call count). The audience is a developer auditing where their Claude spend is going. The primary challenge is fitting three columns on small screens while keeping repo slugs legible with correct truncation.

---

## Existing Patterns Referenced

- `PlaceholderCard` in `InsightsPage.tsx` — outer card shell (`bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3`) reused
- `DeltaChip` in `InsightsPage.tsx` — `text-xxs font-mono font-semibold px-1 py-0.5 rounded-dt-xs bg-*/10` badge pattern reused for proportion bars accent
- `SecondaryTile` in `InsightsPage.tsx` — label/value density (`text-xxs uppercase tracking-wide` for column heads) reused
- `HeatmapGrid.tsx` — `flex-1 h-3 rounded-sm` narrow horizontal bar motif adapted for per-item proportion indicators
- Skeleton: `animate-pulse bg-dt-bg2 rounded` blocks matching existing tile skeleton dimensions

---

## Component Hierarchy

```
TopConsumersCard/
├── CardHeader
│   └── Title ("Top Consumers")
└── ThreeColumnGrid
    ├── ConsumerColumn (topRepos)
    │   ├── ColumnHeader ("Top Repos")
    │   └── ConsumerRow × up to 5
    │       ├── RankNumber
    │       ├── NameCell (truncated slug)
    │       ├── ProportionBar (accent-coloured, inline)
    │       └── ValueLabel (cost or calls)
    ├── ConsumerColumn (topSessions)
    │   ├── ColumnHeader ("Top Sessions")
    │   └── ConsumerRow × up to 5
    └── ConsumerColumn (topTools)
        ├── ColumnHeader ("Top Tools")
        └── ConsumerRow × up to 10
```

---

## Props Interface

```typescript
// Sourced from server InsightsBreakdown (types.ts)
interface InsightsTopRepo {
  slug: string;     // raw cwd path, e.g. "/home/user/my-project"
  tokens: number;
  cost: number;
}

interface InsightsTopSession {
  id: string;
  label: string;    // "repo-name · YYYY-MM-DD"
  cost: number;
}

interface InsightsTopTool {
  name: string;
  calls: number;
}

interface TopConsumersProps {
  topRepos: InsightsTopRepo[];       // sorted desc by cost, max 5
  topSessions: InsightsTopSession[]; // sorted desc by cost, max 5
  topTools: InsightsTopTool[];       // sorted desc by calls, max 10
  loading?: boolean;
  error?: string | null;
  className?: string;
  testId?: string;
}
```

---

## State Mapping

| State | ThreeColumnGrid | Notes |
|-------|----------------|-------|
| Loading | Each column: header + 3 skeleton rows (`h-5 bg-dt-bg2 rounded animate-pulse`) | Stagger skeleton widths: w-full / w-4/5 / w-2/3 per row for visual rhythm |
| Empty (all lists `[]`) | All three columns show inline "—" after their header | Single dash centred below header |
| Empty (one column `[]`) | That column shows "—", others render normally | Partial empty is a valid state |
| Error | Error banner replaces entire grid, `role="alert"` | Column headers not rendered during error |
| Populated | Full three-column grid | Primary state |

---

## ConsumerRow Specification

**Layout:** `flex items-center gap-2` row, `min-h-[28px]`, `py-0.5`.

### Columns (left to right):

1. **RankNumber** — `w-4 text-right text-xxs font-mono text-dt-text2 flex-shrink-0`. Displays `1`, `2`, `3`... Do not use `#` prefix.

2. **NameCell** — `flex-1 min-w-0` with `truncate` on the inner text element. See Truncation Rules below.

3. **ProportionBar** — inline `<div>` container `w-16 flex-shrink-0`. Inner `<div>` with `h-1.5 rounded-full bg-dt-accent` (repos/sessions) or `bg-dt-teal` (tools). Width set via inline style as percentage of the max value in the column. `aria-hidden="true"`.

4. **ValueLabel** — `text-right text-xxs font-mono text-dt-text2 flex-shrink-0`. Repos: `formatCost(cost)`. Sessions: `formatCost(cost)`. Tools: call count as `String(calls)` with no unit suffix.

### Truncation Rules

| Column | Source field | Display strategy |
|--------|-------------|-----------------|
| Top Repos | `slug` (full CWD path) | Show basename only: `slug.split("/").filter(Boolean).pop() ?? slug`. If basename is empty (root "/"), show the full slug. Add full path as `title` attribute for tooltip. |
| Top Sessions | `label` (already formatted "repo · date") | Truncate with `text-ellipsis overflow-hidden whitespace-nowrap`. No further transformation. The label is short enough to fit most cases. |
| Top Tools | `name` (tool name, e.g. "Read", "Edit", "Bash") | No truncation needed — tool names are short. Render as-is. |

**Minimum width constraint:** `min-w-0` on NameCell enables `truncate` to work inside a flex container. Without it, flex items don't shrink below content width and truncation is silently skipped.

---

## ColumnHeader Specification

`text-xxs font-mono text-dt-text2 uppercase tracking-wide pb-1.5 border-b border-dt-border mb-1.5`

Text values: "Top Repos", "Top Sessions", "Top Tools" — verbatim.

---

## ThreeColumnGrid Layout

`grid grid-cols-3 gap-4` at tablet and above. On mobile (< 640px), collapses to `grid-cols-1 gap-5` — each column stacks vertically and has a visible `border-b border-dt-border pb-4` between columns. The last column omits the border-b.

---

## ProportionBar Computation

Each column computes its own maximum independently:
- Repos: `max = Math.max(...topRepos.map(r => r.cost), 1)`
- Sessions: `max = Math.max(...topSessions.map(s => s.cost), 1)`
- Tools: `max = Math.max(...topTools.map(t => t.calls), 1)`

Bar width: `width: "${(value / max) * 100}%"` inline style. The first-ranked item always fills the full `w-16` container.

The proportion bar `<div>` parent must have `overflow-hidden` to clip the inner bar if rounding errors produce > 100% width.

---

## Interaction Flow

```
InsightsPage renders with loading=true
  → TopConsumersCard shows skeleton across all three columns

Data arrives
  → If all three arrays are empty
      → Show three headers with "—" each
  → If any array has items
      → Render rows in that column
      → Proportion bars animate from 0 to final width (CSS transition: width 300ms ease)
      → Hovering repo basename shows full path tooltip via title attribute

Error
  → Error banner replaces grid
```

---

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 640px (mobile) | `grid-cols-1` — each column is full width, separated by border-bottom |
| 640–1024px (tablet) | `grid-cols-3` — three equal columns |
| > 1024px (desktop) | `grid-cols-3` — three equal columns; card spans full content area width |

At mobile widths the repos column appears first, sessions second, tools third — which matches the existing sort order (most actionable data first for a mobile glance).

---

## Accessibility Checklist

- [ ] ProportionBars are `aria-hidden="true"` — they are decorative; numerical value is in ValueLabel
- [ ] No information conveyed by bar colour alone — rank number and value label duplicate the bar's meaning
- [ ] Repo basename cells have `title` attribute containing the full slug — available to screen readers and visible on hover
- [ ] Error banner uses `role="alert"`
- [ ] Loading skeleton card root uses `aria-busy="true"`
- [ ] Column headers are `<h3>` elements (or `role="heading" aria-level="3"`) for document outline — they are inside an `<h2>`-level section card
- [ ] Touch targets for rows: rows are display-only (no click), so 44px minimum does not apply. If a future iteration makes rows clickable, add `min-h-[44px]` to ConsumerRow.
- [ ] Colour contrast: `dt-text2` on `dt-bg1` meets 4.5:1 in both light and dark themes per existing verified usage in HeatmapGrid

---

## Wireframe

```
┌─────────────────────────────────────────────────────────────────────┐
│  Top Consumers                                                       │
├───────────────────┬───────────────────┬─────────────────────────────┤
│  TOP REPOS        │  TOP SESSIONS     │  TOP TOOLS                  │
├───────────────────┼───────────────────┼─────────────────────────────┤
│  1  my-project   ████████  $4.20     │  1  my-project · 04-18  ████│  1  Read    ██████████  342  │
│  2  other-repo   ███        $1.80    │  2  other · 04-17       ██  │  2  Edit    ██████       198  │
│  3  side-proj    ██         $0.90    │  3  side · 04-15        █   │  3  Bash    ████         124  │
│  4  scripts      █          $0.40    │  4  proj · 04-14        █   │  4  Write   ███           87  │
│  5  dotfiles     ▌          $0.10    │  5  test · 04-13        ▌   │  5  Glob    ██            65  │
└───────────────────┴───────────────────┴─────────────────────────────┘
```

Mobile stacked view (< 640px):
```
┌──────────────────────────────┐
│  Top Consumers               │
├──────────────────────────────┤
│  TOP REPOS                   │
│  1  my-project  ████  $4.20  │
│  2  other-repo  ██    $1.80  │
│  ─────────────────────────── │
│  TOP SESSIONS                │
│  1  my-project · 04-18  ████ │
│  ...                         │
│  ─────────────────────────── │
│  TOP TOOLS                   │
│  1  Read  ██████████    342  │
└──────────────────────────────┘
```

---

## Implementation Notes for Engineer

- `formatCost()` is already exported from `dashboard/src/lib/cost.ts` — use it for repos and sessions columns.
- Basename extraction: `slug.split("/").filter(Boolean).pop() ?? slug` — the `.filter(Boolean)` removes empty strings from leading slashes, `.pop()` takes the last segment.
- Proportion bar width must be set as inline style (`style={{ width: "…%" }}`), not Tailwind arbitrary width, because the value is dynamic. This is the one permitted exception to the "no inline styles" rule per `fe-guide.md` ("inline styles only for dynamic values").
- The `section-card-top-consumers` test ID on the existing placeholder in `InsightsPage.tsx` must be transferred to this component.
- Tools column shows up to 10 rows (server returns max 10). Repos and Sessions show up to 5 rows. No pagination in M6 scope.
- Edge case: `topTools` array has entries with `calls = 0` — filter these out before rendering (a tool with zero calls should not appear).
- Edge case: repo slug is "/" (user ran Claude in filesystem root) — basename would be ""; fallback to full slug display.
- Edge case: all costs are zero (free tier or cached-only usage) — proportion bars all collapse to zero width. This is correct. ValueLabel shows "$0.00".
- The proportion bar transition `transition-[width] duration-300 ease-out` should only apply when `loading` transitions to false. If the component re-renders while populated (e.g. time range change), the transition gives a smooth update feel at no extra cost.
