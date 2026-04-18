---
task_id: bugfix-applayout-router-state-loop
title: "Fix: AppLayout useRouterState loop — replace useRouterState with useLocation, stabilize useRepos.refresh"
verdict: APPROVED
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 0
  p3: 1
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-18T18:07:01Z"
commit: "d72bb07bee69dfcd8c034c249574382b72f52062 (HEAD — note: fix is in uncommitted working tree on branch fix/applayout-router-state-loop)"
---

## Review: bugfix-applayout-router-state-loop — AppLayout router-state re-render loop

### Business Alignment

- [PASS] Root cause addressed — `useRouterState()` subscribes to full TanStack Router state (loading, pending, match changes), firing on every router event. Replaced with `useLocation()` which notifies only on pathname changes. Evidence: `dashboard/src/routes/AppLayout.tsx:2,28-29` (working tree).
- [PASS] Secondary fix applied — `useRepos.refresh` wrapped in `useCallback(fn, [])`, preventing a new function reference on every render. Evidence: `dashboard/src/hooks/useRepos.ts:21`.
- [PASS] Test mock updated to match API change — mock replaced `useRouterState: () => ({ location: { pathname: "/" } })` with `useLocation: () => ({ pathname: "/" })`. Evidence: `dashboard/src/__tests__/applayout-sessionisrunning-wiring.test.tsx:117-120`.

### Build Status

PASS — 1335/1335 tests pass, tsc zero errors, eslint zero warnings on all modified files.

```
tsc --noEmit (dashboard): clean
eslint (AppLayout.tsx, useRepos.ts, wiring test): clean
pnpm -C dashboard test: 118 test files, 1335 tests — all pass
```

### P0 — Blockers

None.

### P1 — Must Fix

None.

### P2 — Should Fix

None.

### P3 — Optional

- `dashboard/src/components/Titlebar.tsx:2` — still uses `useRouterState()` with the same anti-pattern (`const { location } = useRouterState()`). The Titlebar only reads `location.pathname` for nav-pill highlighting and is rendered once in AppLayout, but it subscribes to the full router state on every router event. Low frequency impact compared to AppLayout (Titlebar renders are lightweight), but it's the same root pattern. Out of scope for this bugfix but worth a follow-up.

### Verdict

APPROVED

### Summary

The fix correctly replaces `useRouterState()` with `useLocation()` in AppLayout — the minimal, idiomatic TanStack Router API for observing only pathname changes. The `useCallback` wrapping of `useRepos.refresh` is belt-and-suspenders here (the hook's consumers store handlers via a ref, so the stability doesn't affect runtime behavior), but it correctly prevents the anti-pattern of unstable function references in hook return values. All three modified files have clean lint, clean types, and 1335 passing tests. The one P3 note (Titlebar.tsx using the same deprecated pattern) is out of scope and non-blocking.

Note: This review covers uncommitted working-tree changes on branch `fix/applayout-router-state-loop`. The HEAD commit (d72bb07) introduced `useRouterState()` — the fix reverts that API choice to `useLocation()` without being committed yet.
