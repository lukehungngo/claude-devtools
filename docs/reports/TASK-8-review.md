---
task_id: TASK-8
title: "InsightsPage Wiring — Re-review after P1 fix"
verdict: APPROVED_WITH_CHANGES
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 2
  p3: 1
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-18T20:34:31Z"
commit: "5033438e911022fc84ba3b5e01d0881df63068ab"
---

## Review: TASK-8 — InsightsPage Wiring (Re-review)

### Business Alignment
- [PASS] InsightsPage renders all required sections (headline tiles, stat tiles, secondary tiles, trend chart, activity, model mix, top consumers, M7 trends) — confirmed by 19 passing tests.
- [PASS] Time-range and repo filter controls present and wired (`SegPill` components with `data-testid` attributes).
- [PASS] Error banner renders when `useInsightsAggregate` returns an error.
- [PASS] Loading skeletons present for all data-dependent sections.
- [PASS] `PlaceholderCard` / `PlaceholderCardProps` — previously blocking P1 — **confirmed removed**. No occurrence in `InsightsPage.tsx`.

### Build Status
PASS — All three mandatory diagnostics clean:
- ESLint: 0 warnings, 0 errors
- TypeScript: 0 type errors (`npx tsc --noEmit -p dashboard/tsconfig.json`)
- Tests: 19/19 passed (`pnpm -C dashboard test src/routes/InsightsPage.test.tsx --run`)

### P0 — Blockers
None.

### P1 — Must Fix
None.

### P2 — Should Fix

**dashboard/src/routes/InsightsPage.tsx:217-219** — `error` fields from `useInsightsActivity`, `useInsightsBreakdown`, and `useInsightsTrends` are destructured-away (not surfaced). Only `useInsightsAggregate`'s `error` is rendered in the error banner. Silent failures in the secondary hooks leave the user with a perpetual skeleton and no indication of why data never loaded.

```tsx
// current — error silently dropped
const { data: activityData, loading: activityLoading } = useInsightsActivity(timeRange, repo);
```

Suggested fix: capture and surface `error` fields from all four hooks in the banner, or at minimum render a per-section error state.

**dashboard/src/routes/InsightsPage.tsx:438-439** — When `trendsLoading` is true or `trendsData` is null, a single shared skeleton `<div … h-32 … animate-pulse />` covers all three trend sections (Commands, Agents, Skills). Each section renders separately when data arrives. The single shared skeleton creates a visual discontinuity and fails to communicate that three independent cards are loading. (P2 — cosmetic/UX, non-blocking.)

### P3 — Optional

**dashboard/src/routes/InsightsPage.test.tsx** — The double semicolon noted in the previous review (`;; `) remains. Minor style issue, non-blocking.

### Verdict
APPROVED_WITH_CHANGES

### Summary
The P1 blocker from the previous review — the unused `PlaceholderCard` component — has been removed and all three mandatory diagnostics (ESLint, TypeScript, Vitest) pass cleanly with zero errors or warnings. No new regressions were introduced. Two pre-existing P2 cosmetic issues remain (silent error swallowing in secondary hooks, shared skeleton for three trend sections) and one P3 style nit (double semicolon in test file); none of these block merge.
