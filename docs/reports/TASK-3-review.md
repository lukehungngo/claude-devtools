---
task_id: TASK-3
title: "Insights HTTP Routes — /insights/breakdown and /insights/trends"
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
reviewed_at: "2026-04-18T20:38:14Z"
commit: "5033438e911022fc84ba3b5e01d0881df63068ab"
---

## Review: TASK-3 — Insights HTTP Routes

### Business Alignment

- [PASS] `timeRange` query param validated against `VALID_TIME_RANGES` Set — both new routes return 400 with error message for invalid values (`insights-routes.ts:67-70, 91-94`)
- [PASS] Defaults: `timeRange` defaults to `"7d"`, `repo` defaults to `"all"` — verified at lines 64-65, 88-89
- [PASS] `discoverSessions()` called then result passed to respective aggregator — lines 75-80, 99-104
- [PASS] 500 returned on aggregator exception — lines 82-84, 106-108
- [PASS] Tests confirm all acceptance criteria (23/23 tests passing, including 500-path tests for both new routes)

**Phase A note — Route path pattern:**

The new routes register as `/insights/breakdown` and `/insights/trends`. The existing routes register as `/api/insights/aggregate` and `/api/insights/activity`. These look inconsistent, but the new routes are actually **correct** for the mount point.

The server mounts `setupRoutes` at `/api` (`server.ts:84`). Express strips the mount prefix before dispatching to the sub-router. Therefore:
- New routes: `router.get("/insights/breakdown")` → reachable at `/api/insights/breakdown` ✓
- Existing routes: `router.get("/api/insights/aggregate")` → reachable at `/api/api/insights/aggregate` (pre-existing bug, out of scope)

The dashboard hooks fetch `/api/insights/breakdown` and `/api/insights/trends` (`useInsightsBreakdown.ts:37`, `useInsightsTrends.ts:38`), which matches the new routes correctly.

### Build Status

PASS

```
npx tsc --noEmit -p server/tsconfig.json    → 0 errors
pnpm -C server test insights-routes.test.ts → 23/23 passed
npx eslint insights-routes.ts ...test.ts    → 0 warnings
ESLint v9.39.4 (flat config, --max-warnings 0)
```

### P0 — Blockers

None.

### P1 — Must Fix

None.

### P2 — Should Fix

**server/src/http/routes/insights-routes.ts:34, 58, 82, 106 — Error swallowing without logging**

All four route handlers catch exceptions and return 500 but discard the error object entirely:

```typescript
} catch {
  res.status(500).json({ error: "Failed to compute insights breakdown" });
}
```

When `discoverSessions()` or an aggregator throws, the error is silently dropped. No pino log call, no stack trace. Diagnosing production failures requires grepping for 500 responses with no correlated server log. The project rule is "pino logger (never `console.log`)" — this means errors should be passed to `logger.error()`. The new routes inherit this pattern from the existing routes, but it is still a correctness concern.

This applies to all four handlers (lines 34, 58 in existing routes; lines 82, 106 in new routes).

**server/src/http/routes/insights-routes.ts:16, 40, 64, 88 — `as string` cast on unvalidated query param**

```typescript
const timeRange = (req.query.timeRange as string) ?? "7d";
```

`req.query.timeRange` can be `string | string[] | ParsedQs | ParsedQs[] | undefined`. Casting directly to `string` without narrowing means if a caller passes `?timeRange[]=7d` (array form), the cast succeeds but `VALID_TIME_RANGES.has(...)` returns false and a 400 is returned — correct behavior, but for the wrong reason. A proper narrow (e.g., `typeof v === "string" ? v : undefined`) would be explicit. Low impact because the validation gate catches it, but the cast is technically unsound. Applies to all four handlers.

### P3 — Optional

**server/src/http/routes/insights-routes.ts:63, 87 — New routes should consistently include `/api/` prefix OR the existing routes should be fixed**

There is now a visible inconsistency in the file: two routes start with `/api/insights/...` and two start with `/insights/...`. Both are correct for their respective purposes (the existing routes have a double-prefix bug that has been there since they were added), but the inconsistency will confuse the next engineer reading the file. A comment on the existing routes noting the double-prefix situation, or a ticket to fix the existing routes to match the new correct pattern, would reduce confusion.

### Verdict

APPROVED_WITH_CHANGES

### Summary

Both new routes are correctly implemented: validation logic, defaults, aggregator delegation, and 500 handling all match the task spec. All 23 tests pass (including 500-path coverage that the existing routes lack). TypeScript and ESLint are clean. The two P2 issues — swallowed errors with no logging, and unsound query param casts — are pre-existing patterns inherited from the existing routes; the new routes do not introduce them fresh, but they are worth addressing in a follow-up pass. No P0 or P1 issues found.
