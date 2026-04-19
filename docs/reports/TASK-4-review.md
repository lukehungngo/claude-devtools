---
task_id: TASK-4
title: "Dashboard Hooks — useInsightsBreakdown and useInsightsTrends"
verdict: APPROVED_WITH_CHANGES
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 1
  p3: 2
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-19T03:37:00"
commit: "5033438e911022fc84ba3b5e01d0881df63068ab"
---

## Review: TASK-4 — Dashboard Hooks — useInsightsBreakdown and useInsightsTrends

### Business Alignment

- [PASS] Cancellation pattern matches `useInsightsActivity` — both hooks use `let cancelled = false` flag + cleanup returning `() => { cancelled = true }`, identical to the reference hook.
- [PASS] URL params use `encodeURIComponent` on both `timeRange` and `repo` — lines 37/38 of each hook.
- [PASS] Returns `{ data, loading, error }` shape — verified in both hooks.
- [PASS] Local type definitions — `InsightsBreakdown`, `InsightsTrendEntry`, `InsightsTrends`, etc. are all defined locally with no cross-workspace imports.
- [PASS] Endpoints correct — `/api/insights/breakdown` and `/api/insights/trends` match plan spec.
- [PASS] Test counts match — 6 breakdown tests, 5 trends tests (11 total, all passing).

### Build Status

PASS — All diagnostics clean.

```
npx tsc --noEmit -p dashboard/tsconfig.json   → 0 errors
npx eslint ... --max-warnings 0               → 0 warnings, 0 errors
pnpm -C dashboard test (targeted hook tests)  → 11/11 pass
                                                1 unrelated TurnCard failure (pre-existing, not in scope)
```

ESLint: v9.39.4 (flat config, no `--ext` flag needed). TypeScript strict: zero errors.

### P0 — Blockers

None.

### P1 — Must Fix

None.

### P2 — Should Fix

- `dashboard/src/hooks/useInsightsBreakdown.ts:19`, `useInsightsTrends.ts:20`, `dashboard/src/routes/InsightsPage.tsx:16` — `TimeRange` type is duplicated three times with identical literal union `"24h" | "7d" | "30d" | "90d" | "all"`. This is knowledge duplication: if a new time range (e.g., `"1y"`) is added, all three files need simultaneous updates. The type should be defined once (e.g., in `lib/types.ts` alongside `InsightsActivity`) and imported by callers. Note: `useInsightsActivity` uses plain `string` for its parameter, creating an inconsistency in the hook family — either all should use `TimeRange` or all should use `string`.

### P3 — Optional

- `dashboard/src/hooks/useInsightsBreakdown.ts:39`, `useInsightsTrends.ts:40` — `.then(async (res) => {...})` uses the `async` keyword on the callback unnecessarily. There is no `await` inside; the body uses `return res.json()` which is a plain Promise return. The `async` has no functional effect but is inconsistent with the reference hook (`useInsightsActivity` uses `.then((r) => {...})` without `async`). Remove `async` for consistency.

- `dashboard/src/hooks/useInsightsBreakdown.ts:50-54`, `useInsightsTrends.ts:51-55` — Error handler calls `setData(null)` explicitly, but the reference hook `useInsightsActivity` does not. This is a positive deviation (more defensive) but creates an inconsistency in the hook family. Minor; no functional issue.

### Verdict

APPROVED_WITH_CHANGES

### Summary

Both hooks are well-implemented and structurally correct. The cancellation pattern, URL encoding, return shape, and local type definitions all match the spec and the reference hook. All 11 tests pass, TypeScript is clean, and ESLint is clean. The only noteworthy issue is the `TimeRange` union type being duplicated across three files (P2), which creates a future maintenance risk. Two minor style deviations from the reference hook (unnecessary `async` on `.then` callback, `setData(null)` in error handler) are P3 style notes only.
