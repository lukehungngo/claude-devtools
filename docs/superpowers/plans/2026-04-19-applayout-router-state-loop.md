# AppLayout Router State Render Loop Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the render loop that causes 286+ API calls on session load by replacing `useRouterState()` with `useLocation()` in AppLayout, and stabilize `useRepos.refresh` with `useCallback`.

**Architecture:** `useRouterState()` subscribes to full TanStack Router state (loading, pending matches, transitions), causing AppLayout to re-render on every router event. Since `contextValue` is an unstated object literal, every AppLayout re-render pushes a new context to all consumers, amplifying churn. The fix: `useLocation()` only re-renders on actual pathname changes.

**Tech Stack:** React 18, TanStack Router v1, Vitest, `@testing-library/react`

---

## File Map

| File | What Changes |
|------|-------------|
| `dashboard/src/routes/AppLayout.tsx` | Replace `useRouterState` with `useLocation` |
| `dashboard/src/hooks/useRepos.ts` | Wrap `refresh` in `useCallback` |
| `dashboard/src/__tests__/applayout-sessionisrunning-wiring.test.tsx` | Update tanstack-router mock: `useRouterState` → `useLocation` |

---

### Task 1: Replace `useRouterState` with `useLocation` in AppLayout

**Size:** micro

**Files:**
- Modify: `dashboard/src/routes/AppLayout.tsx:2,28-29`
- Modify: `dashboard/src/__tests__/applayout-sessionisrunning-wiring.test.tsx:116-121`

- [ ] **Step 1: Update the router mock in the existing test to use `useLocation`**

In `dashboard/src/__tests__/applayout-sessionisrunning-wiring.test.tsx`, lines 116-121, change the mock from:

```typescript
// Mock tanstack router (AppLayout uses useNavigate, useRouterState, and renders <Outlet />)
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: "/" } }),
  Outlet: MetricsProbe, // Renders MetricsProbe in center slot to capture context
}));
```

to:

```typescript
// Mock tanstack router (AppLayout uses useNavigate, useLocation, and renders <Outlet />)
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
  Outlet: MetricsProbe, // Renders MetricsProbe in center slot to capture context
}));
```

- [ ] **Step 2: Run the test to confirm it now FAILS (because AppLayout still uses `useRouterState`)**

Run from `dashboard/`:
```bash
npx vitest run src/__tests__/applayout-sessionisrunning-wiring.test.tsx
```

Expected: FAIL — `useRouterState is not a function` or similar.

- [ ] **Step 3: Update AppLayout to use `useLocation`**

In `dashboard/src/routes/AppLayout.tsx`:

Line 2 — change import:
```typescript
// BEFORE
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

// AFTER
import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
```

Lines 28-29 — change usage:
```typescript
// BEFORE
  const routerState = useRouterState();
  const isInsights = routerState.location.pathname === "/insights";

// AFTER
  const { pathname } = useLocation();
  const isInsights = pathname === "/insights";
```

- [ ] **Step 4: Run test to confirm it now PASSES**

```bash
npx vitest run src/__tests__/applayout-sessionisrunning-wiring.test.tsx
```

Expected: PASS — all existing tests in that file pass.

- [ ] **Step 5: Run full dashboard test suite to confirm no regressions**

```bash
pnpm test
```

Expected: 118 files, 1335 tests pass (same as baseline).

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/routes/AppLayout.tsx dashboard/src/__tests__/applayout-sessionisrunning-wiring.test.tsx
git commit -m "fix: replace useRouterState with useLocation in AppLayout to stop render loop"
```

---

### Task 2: Stabilize `useRepos.refresh` with `useCallback`

**Size:** micro

**Files:**
- Modify: `dashboard/src/hooks/useRepos.ts:1,21-29`

- [ ] **Step 1: Add `useCallback` import and wrap `refresh`**

In `dashboard/src/hooks/useRepos.ts`, apply this exact change:

```typescript
// BEFORE (full file)
import { useState, useEffect } from "react";
import type { RepoGroup } from "../lib/types";

export function useRepos() {
  const [repos, setRepos] = useState<RepoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRepos(data.repos || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const refresh = () => {
    fetch("/api/repos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setRepos(data.repos || []))
      .catch(() => {});
  };

  return { repos, loading, refresh };
}
```

```typescript
// AFTER (full file)
import { useState, useEffect, useCallback } from "react";
import type { RepoGroup } from "../lib/types";

export function useRepos() {
  const [repos, setRepos] = useState<RepoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRepos(data.repos || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    fetch("/api/repos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setRepos(data.repos || []))
      .catch(() => {});
  }, []);

  return { repos, loading, refresh };
}
```

- [ ] **Step 2: Run full dashboard test suite**

```bash
pnpm test
```

Expected: 118 files, 1335 tests pass.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/hooks/useRepos.ts
git commit -m "fix: memoize useRepos.refresh with useCallback to stabilize hook identity"
```
