# Plan: token-trend-chart

## Requirement
Add a token trend chart to the Insights page showing input tokens per day over time, with tool milestone bands (swimlane rows). First shot — keep it simple. User adds/removes tool milestones manually to see where token savings kicked in.

## Design
- Line chart: daily input tokens (X = date, Y = tokensIn)
- Below the chart: one swimlane row per tool milestone, showing the active date range as a colored band
- Milestones stored in localStorage: `[{ name, startDate, endDate|null, color }]`
- Simple "Add milestone" UI: name + start date + optional end date

## Tasks

### TASK-01: Server — add daily token aggregation to InsightsActivity
**Goal:** Extend `InsightsActivity` with a `daily` field: array of `{ date: string (YYYY-MM-DD), tokensIn: number, tokensOut: number, cost: number }` sorted by date ascending. Scoped to the selected timeRange and repo filters (same as other Insights endpoints).

**Files:**
- `server/src/types.ts` — add `InsightsDailyBucket` interface + `daily` field to `InsightsActivity`
- `server/src/analyzer/activity-aggregator.ts` — compute daily aggregates from sessions
- `server/src/analyzer/activity-aggregator.test.ts` — add test for daily aggregation

**Acceptance:**
1. `InsightsActivity.daily` is an array of `InsightsDailyBucket` sorted by date asc
2. Each bucket sums `tokensIn`, `tokensOut`, `cost` across all sessions starting on that date
3. Server tests pass

### TASK-02: Dashboard — TokenTrendChart component
**Goal:** Add a `TokenTrendChart` section to the Insights page below the existing charts. Shows a recharts line chart of daily tokensIn + a swimlane area beneath it for tool milestones stored in localStorage.

**Files:**
- `dashboard/src/components/insights/TokenTrendChart.tsx` (new)
- `dashboard/src/routes/InsightsPage.tsx` — add TokenTrendChart section
- `dashboard/src/hooks/useInsightsActivity.ts` — confirm `daily` field is passed through

**Acceptance:**
1. Line chart renders daily `tokensIn` from `activityData.daily`
2. Below chart: swimlane rows, one per milestone, showing colored band for the active date range
3. "Add milestone" button opens a simple inline form: name, start date, end date (optional), color picker (5 preset colors)
4. Milestones persisted to `localStorage` under key `dt-tool-milestones`
5. Milestone bands align with chart X axis dates
6. Empty state: chart still renders if no milestones, shows "Add a tool milestone to track impact"
7. TypeScript clean, no `any`

**Working Directory:** /Users/soh/working/ai/claude-devtools/.worktrees/token-trend-chart
