---
task_id: TASK-dag-refresh-timeout
title: "DAG refresh setTimeout fallback for subagent dispatch"
verdict: APPROVED_WITH_CHANGES
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 0
  p3: 2
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-18T19:07:48Z"
commit: "bc7f1c829273005399f8008c39caadcbd9119d60"
---

## Review: TASK-dag-refresh-timeout — DAG refresh setTimeout fallback for subagent dispatch

### Business Alignment

- [PASS] Root cause correctly identified — `useEffect([liveEvents])` never re-fires when main agent goes quiet, so the pending DAG refresh was silently dropped
- [PASS] Fix adds `setTimeout` for remaining throttle window, making refresh timer-driven rather than event-driven
- [PASS] Timer is cancelled on session navigation (session-reset `useEffect` calls `clearTimeout`)
- [PASS] Duplicate timer stacking prevented by `if (pendingDagTimerRef.current === null)` guard

### Build Status

PASS

- Dashboard TypeScript: 0 errors (`npx tsc --noEmit`)
- Dashboard tests: 1336 passed, 1 failed (TurnCard.test.tsx:109 — pre-existing, unrelated to this fix)
- New regression test: 8/8 pass in `sessionPage.dagRefresh.test.ts`
- ESLint: 5 warnings (all pre-existing unused-vars, confirmed by stash comparison — 0 new warnings introduced)
- Server TypeScript: fails with missing devDependencies (node_modules not installed in worktree) — pre-existing worktree environment issue, not caused by this fix

### P0 — Blockers

None.

### P1 — Must Fix

None.

### P2 — Should Fix

None.

### P3 — Optional

**`dashboard/src/routes/SessionPage.tsx:227` vs `dashboard/src/__tests__/sessionPage.dagRefresh.test.ts:6` — Knowledge duplication on throttle constant**

`DAG_REFRESH_THROTTLE_MS = 5000` in the component is not exported. The test defines its own `const THROTTLE_MS = 5000` as a hardcoded magic number. These two are currently in sync, but if the throttle changes the test will silently diverge. Consider exporting `DAG_REFRESH_THROTTLE_MS` from `SessionPage.tsx` and importing it in the test.

**`dashboard/src/__tests__/sessionPage.dagRefresh.test.ts` — Test documents the contract but does not exercise the `setTimeout` path directly**

The new "dead-man switch" test correctly documents that `shouldRefreshDag` returns false when throttled, and that the component must schedule a timer. However, the timer-scheduling logic in the `useEffect` itself is untested. A React Testing Library test with fake timers (e.g. `vi.useFakeTimers()` + `vi.advanceTimersByTime(3000)`) would directly verify that `refreshMetrics` is called after the throttle window even when no further events arrive. This is a gap in component-level coverage, not a blocker.

### Verdict

APPROVED WITH CHANGES

### Summary

The fix correctly addresses the root cause: it adds `pendingDagTimerRef` to schedule a `setTimeout` for the remaining throttle window when an Agent dispatch arrives while throttled. The timer is properly cancelled on session change via `clearTimeout`. The `refreshMetrics` stale-closure concern is safe because `clearTimeout` fires before the old `refresh` function could be called for a different session, and the DAG refresh `useEffect` has `refreshMetrics` in its dependency array so re-scheduling only happens with the current session's `refresh`. The two P3 findings (constant duplication, missing timer integration test) are minor and do not block the fix. The TurnCard.test.tsx:109 pre-existing failure is unrelated to this change.
