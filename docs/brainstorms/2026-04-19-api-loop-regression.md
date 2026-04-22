# Brainstorm: Infinite API call loop on session load

**Date:** 2026-04-19
**Input type:** Problem (with evidence screenshot)
**Input:** "Non-consistent loop of API calls, keeps calling non-stop without any response, flashing consistency. Shows commands + session UUID alternating at 286 requests / 20s, all 304, app stuck on 'Loading session...'"

## Assumptions

| Assumption | Status | Evidence |
|------------|--------|----------|
| 304 = error in fetch hooks | QUESTIONED | Browser Fetch API converts server 304 → 200-from-cache; JS sees `r.ok = true`. The 304 in DevTools is the wire status, not what JS receives. |
| Loop is caused by M5 changes | QUESTIONED | M5 added `useRouterState()` to AppLayout — plausibly the trigger, but contextValue instability was pre-existing |
| `useUnifiedWebSocket` reconnects on re-render | CONFIRMED FALSE | Effect has `[]` deps; handlers stored in ref, updated without re-running the effect |
| `useSessionMetrics` refetches on re-render | CONFIRMED FALSE | Effect deps are `[projectHash, sessionId, refreshCount]` — stable primitives |
| `useRepos.refresh` is stable | CONFIRMED FALSE | Inline function — new reference on every render of useRepos |

## Fundamentals

1. `contextValue` in AppLayout (line 239) is a plain object literal — new reference on every render. No `useMemo`. Passed to `LayoutContext.Provider`. Pre-existing issue.

2. `useRouterState()` (AppLayout lines 28-29, added by M5) subscribes to the FULL router state — fires on route loading start, end, match data changes, pending transitions. Causes AppLayout to re-render on events that previously did not trigger re-renders.

3. Every AppLayout re-render → new contextValue → context update → all `useLayoutContext()` consumers re-render (SessionPage, PromptInput, every child).

4. `useDiscoveryCommands` in PromptInput: `fetchedForRef` is local to mount — resets on unmount/remount. Retries every 3s if server returns `source: "fallback"`. On unmount (triggered by rendering condition changing), resets to null and re-fetches from scratch.

5. `useRepos.refresh` is NOT memoized. New function reference on every render. Passed as `onNewSession` handler.

## Root Cause

Three-leg feedback cycle:

```
useRouterState() fires (router loading/transition state)
  → AppLayout re-renders
  → new contextValue (unstable object)
  → ALL LayoutContext consumers re-render
  → if projectHash flips null ↔ value:
      → useSessionMetrics: setLoading(true) → "Loading session..."
      → before fetch resolves: re-render → AbortController.abort()
      → setLoading(false) never reached → stuck forever

SEPARATELY:
  → PromptInput re-renders → if conditionally mounted/unmounted:
      → useDiscoveryCommands fetchedForRef reset
      → re-fetches /api/commands → source "fallback" → 3s retry
      → component unmounts before retry → ref resets → immediate refetch
      → loop
```

**M5 trigger:** Before M5, AppLayout did not call `useRouterState()`. Only re-rendered on own state changes. Now re-renders on every router state change, amplifying existing context instability.

**Why intermittent:** Only triggers when router is in transition (navigating to session, route data loads). Stabilizes once router settles.

## Fix

**Fix 1 (urgent — stops M5 regression):**
Replace `useRouterState()` with `useLocation()` in `dashboard/src/routes/AppLayout.tsx`:

```typescript
// BEFORE (lines 28-29)
const routerState = useRouterState();
const isInsights = routerState.location.pathname === "/insights";

// AFTER
const { pathname } = useLocation();
const isInsights = pathname === "/insights";
```

`useLocation()` only re-renders on actual pathname changes, not on loading/match state changes.

**Fix 2 (latent pre-existing):**

Memoize `useRepos.refresh` in `dashboard/src/hooks/useRepos.ts`:
```typescript
const refresh = useCallback(() => {
    fetch("/api/repos")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => setRepos(data.repos || []))
      .catch(() => {});
}, []);
```

Memoize `contextValue` in AppLayout with `useMemo` to prevent context churn on re-renders.

## Next Steps

```
/mas:bug-fix fix useRouterState() → useLocation() in AppLayout + memoize useRepos.refresh
```
