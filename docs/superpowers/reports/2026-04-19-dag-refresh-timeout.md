# Bug Fix Report: fix/dag-refresh-timeout

**Plan:** `docs/superpowers/plans/2026-04-19-dag-refresh-timeout.md`
**Date:** 2026-04-19
**Branch:** fix/dag-refresh-timeout

## Bug

New subagents dispatched by the main Claude agent did not appear in the agent graph until the user manually reloaded the page. Expected: graph updates automatically within ~5s of Agent dispatch.

## Root Cause

The DAG refresh `useEffect` in `SessionPage.tsx` used a "pending flag + event-driven retry" pattern: set `pendingDagRefreshRef.current = true` when throttled, retry when the next `liveEvents` update fires. While a subagent runs, the main agent emits no new events — `liveEvents` is frozen — so `useEffect([liveEvents])` never runs again. The pending refresh was silently dropped.

## Fix Applied

Added `pendingDagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)`.

When the throttle blocks an immediate refresh, the effect now schedules `setTimeout(() => refreshMetrics(), remainingMs)` instead of returning bare. The timer fires independently of future `liveEvents` changes. A null-guard prevents duplicate timers. The session-reset effect clears the timer on session navigation.

**Files changed:**
- `dashboard/src/routes/SessionPage.tsx` — +1 ref, +17 lines in DAG useEffect, +4 lines in session-reset useEffect
- `dashboard/src/__tests__/sessionPage.dagRefresh.test.ts` — +1 regression test (dead-man switch scenario)

## Review Verdict

**APPROVED WITH CHANGES** — P3 findings only (non-blocking):
- `DAG_REFRESH_THROTTLE_MS` constant is not exported, so test hardcodes 5000 (divergence risk if constant changes)
- Timer path has no component-level fake-timer test (contract documented but not directly exercised)

Both are P3 — deferred to follow-up.

## Verification

- Lint: PASS (5 pre-existing warnings, 0 new)
- Typecheck: PASS (0 errors)
- Tests: PASS — 1336/1337 (1 pre-existing fail in TurnCard.test.tsx:109, unrelated)
- New regression test: PASS
- Reproduction: FIXED — refresh now fires within `DAG_REFRESH_THROTTLE_MS` ms of Agent dispatch regardless of whether further liveEvents arrive

## Verdict

FIXED
