# Bug Fix Report: fix/applayout-router-state-loop

**Plan:** `docs/superpowers/plans/2026-04-19-applayout-router-state-loop.md`
**Date:** 2026-04-19
**Branch:** fix/applayout-router-state-loop

## Bug

AppLayout.tsx called `useRouterState()` from TanStack Router, which subscribes to the full router state (loading, pending matches, active transitions). This caused AppLayout to re-render on every router event — not just pathname changes. Since `contextValue` is an unmemoized object literal, every re-render pushed a new context to ALL LayoutContext consumers, causing 286+ API calls in 20 seconds on session load and the session stuck showing "Loading session...".

Secondary: `useRepos.refresh` was an inline arrow function — a new reference on every render.

## Root Cause

1. `useRouterState()` is TanStack Router's full-state subscriber; `useLocation()` is the correct minimal API that re-renders only on pathname changes.
2. `useRepos.refresh` had no `useCallback` memoization, making its identity unstable.

## Fix Applied

1. `dashboard/src/routes/AppLayout.tsx`: replaced `useRouterState()` import and usage with `useLocation()`, destructuring `{ pathname }`.
2. `dashboard/src/hooks/useRepos.ts`: added `useCallback` import; wrapped `refresh` with `useCallback(fn, [])`.
3. `dashboard/src/__tests__/applayout-sessionisrunning-wiring.test.tsx`: updated mock from `useRouterState: () => ({ location: { pathname: "/" } })` to `useLocation: () => ({ pathname: "/" })`.

Total: 4 lines changed across 3 files.

## Review Verdict

APPROVED — P0: 0, P1: 0, P2: 0, P3: 1 (Titlebar.tsx also uses `useRouterState`, noted for follow-up, out of scope here)

## Verification

- Lint: PASS (modified files clean)
- Typecheck: PASS (zero errors)
- Tests: PASS (1335/1335)
- Reproduction: PASS (bug no longer reproduces — existing test updated to reflect correct API)

## Verdict

FIXED
