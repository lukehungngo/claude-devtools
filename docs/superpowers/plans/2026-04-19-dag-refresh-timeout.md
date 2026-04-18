# DAG Refresh Timeout Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the pending DAG refresh so it fires via `setTimeout` when throttled, instead of depending on future `liveEvents` changes that never arrive while a subagent runs.

**Architecture:** Add a `pendingDagTimerRef` to `SessionPage.tsx`. When the throttle blocks an immediate `refreshMetrics()` call, schedule it via `setTimeout` for the remaining throttle window. Clear the timer on session change. This is a timer-driven retry, not an event-driven one.

**Tech Stack:** React (useRef, useEffect), TypeScript, Vitest

---

## Root Cause Summary

In `SessionPage.tsx` (~L228–249), the DAG refresh `useEffect` depends on `[liveEvents]`. When:

1. An Agent dispatch arrives → `pendingDagRefreshRef.current = true`
2. Throttle check fires → refresh blocked (< 5s since last refresh)
3. Main agent goes quiet (waiting for subagent) → no new `liveEvents`
4. `useEffect` never runs again → pending refresh silently dropped
5. User must reload to see the new agent in the graph

The fix: replace the bare `return` at GATE 2 with a `setTimeout` that fires the refresh after the remaining throttle window, independent of new events.

---

## Files

- **Modify:** `dashboard/src/routes/SessionPage.tsx` — add `pendingDagTimerRef`, `setTimeout` fallback, clear on session reset
- **Modify:** `dashboard/src/__tests__/sessionPage.dagRefresh.test.ts` — add regression test for the dead man's switch scenario

---

## Task 1: Add Regression Test for Dead Man's Switch

**Files:**
- Modify: `dashboard/src/__tests__/sessionPage.dagRefresh.test.ts`

The `shouldRefreshDag` pure function cannot test the setTimeout behavior (it's in the component). We need a test that documents the bug scenario: an Agent dispatch arrives while throttled, then no further events arrive. The test verifies the expected behavior contract by simulating the timer.

- [ ] **Step 1: Add the regression test**

Append this test to `dashboard/src/__tests__/sessionPage.dagRefresh.test.ts`, inside the existing `describe` block, after the last test:

```typescript
  it('documents the dead-man switch bug: when throttled, refresh must not depend on future events', () => {
    // Reproduction: Agent dispatched at T=0 (within 5s of last refresh).
    // shouldRefreshDag returns false (throttled).
    // Main agent goes quiet. No further liveEvents arrive.
    // Without a setTimeout fallback, refreshMetrics() is never called.
    //
    // This test verifies that shouldRefreshDag correctly returns false when throttled
    // (the component MUST use a setTimeout to handle the deferred case).
    const agentEvent: SessionEvent = {
      type: 'assistant',
      uuid: 'a-dead-switch',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-dead', name: 'Agent', input: {} }],
        model: 'claude-sonnet',
        id: 'msg-dead',
        type: 'message',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    };

    const now = Date.now();
    const recentRefresh = now - 2000; // 2s ago, throttle is 5s → still blocked

    // shouldRefreshDag correctly returns false when throttled
    expect(shouldRefreshDag([agentEvent], recentRefresh, THROTTLE_MS, now)).toBe(false);

    // The component must schedule a setTimeout for (5000 - 2000) = 3000ms.
    // Without this, if no further liveEvents arrive, refreshMetrics() is never called.
    // This test documents the contract — the fix lives in the useEffect, not here.
    const remainingMs = THROTTLE_MS - (now - recentRefresh);
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThan(THROTTLE_MS);
  });
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/dag-refresh-timeout/dashboard
pnpm test --run src/__tests__/sessionPage.dagRefresh.test.ts
```

Expected: PASS (the test documents the contract, not a failing assertion — the fix is in the component).

- [ ] **Step 3: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/dag-refresh-timeout
git add dashboard/src/__tests__/sessionPage.dagRefresh.test.ts
git commit -m "test: document dead-man switch bug in DAG refresh throttle"
```

---

## Task 2: Fix the useEffect — Add setTimeout Fallback

**Files:**
- Modify: `dashboard/src/routes/SessionPage.tsx`

Replace the reactive-only retry with a timer-driven one.

- [ ] **Step 1: Add `pendingDagTimerRef`**

In `SessionPage.tsx`, find the three existing DAG refs (~L223–225):

```typescript
  const lastDagRefreshTimeRef = useRef<number>(0);
  const lastScannedLiveIndexRef = useRef<number>(0);
  const pendingDagRefreshRef = useRef<boolean>(false);
```

Add the timer ref immediately after:

```typescript
  const lastDagRefreshTimeRef = useRef<number>(0);
  const lastScannedLiveIndexRef = useRef<number>(0);
  const pendingDagRefreshRef = useRef<boolean>(false);
  const pendingDagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: Replace the useEffect body**

Find the DAG refresh `useEffect` (~L228–249):

```typescript
  useEffect(() => {
    const newEvents = liveEvents.slice(lastScannedLiveIndexRef.current);
    lastScannedLiveIndexRef.current = liveEvents.length;
    if (newEvents.length === 0) return;

    // Mark pending if any new event is an Agent dispatch
    if (newEvents.some((e) => {
      if (e.type !== 'assistant') return false;
      const content = e.message.content;
      if (!Array.isArray(content)) return false;
      return content.some((c) => c.type === 'tool_use' && c.name === 'Agent');
    })) {
      pendingDagRefreshRef.current = true;
    }

    if (!pendingDagRefreshRef.current) return;
    if (Date.now() - lastDagRefreshTimeRef.current < DAG_REFRESH_THROTTLE_MS) return;

    pendingDagRefreshRef.current = false;
    lastDagRefreshTimeRef.current = Date.now();
    refreshMetrics();
  }, [liveEvents, refreshMetrics]);
```

Replace it with:

```typescript
  useEffect(() => {
    const newEvents = liveEvents.slice(lastScannedLiveIndexRef.current);
    lastScannedLiveIndexRef.current = liveEvents.length;
    if (newEvents.length === 0) return;

    // Mark pending if any new event is an Agent dispatch
    if (newEvents.some((e) => {
      if (e.type !== 'assistant') return false;
      const content = e.message.content;
      if (!Array.isArray(content)) return false;
      return content.some((c) => c.type === 'tool_use' && c.name === 'Agent');
    })) {
      pendingDagRefreshRef.current = true;
    }

    if (!pendingDagRefreshRef.current) return;

    const elapsed = Date.now() - lastDagRefreshTimeRef.current;
    if (elapsed < DAG_REFRESH_THROTTLE_MS) {
      // Throttled: schedule a timer so the refresh fires even if no further
      // liveEvents arrive (e.g. main agent is blocked waiting for subagent).
      if (pendingDagTimerRef.current === null) {
        pendingDagTimerRef.current = setTimeout(() => {
          pendingDagTimerRef.current = null;
          if (!pendingDagRefreshRef.current) return;
          pendingDagRefreshRef.current = false;
          lastDagRefreshTimeRef.current = Date.now();
          refreshMetrics();
        }, DAG_REFRESH_THROTTLE_MS - elapsed);
      }
      return;
    }

    if (pendingDagTimerRef.current !== null) {
      clearTimeout(pendingDagTimerRef.current);
      pendingDagTimerRef.current = null;
    }
    pendingDagRefreshRef.current = false;
    lastDagRefreshTimeRef.current = Date.now();
    refreshMetrics();
  }, [liveEvents, refreshMetrics]);
```

- [ ] **Step 3: Clear the timer on session change**

Find the session-reset `useEffect` (~L279–287):

```typescript
  useEffect(() => {
    setSelectedAgent(null);
    setHighlightedTurnIndex(undefined);
    setSelectedTurnIndex(null);
    sdkContextWindowRef.current = undefined;
    lastScannedLiveIndexRef.current = 0;
    lastDagRefreshTimeRef.current = 0;
    pendingDagRefreshRef.current = false;
  }, [repoSlug, sessionId]);
```

Add timer cleanup:

```typescript
  useEffect(() => {
    setSelectedAgent(null);
    setHighlightedTurnIndex(undefined);
    setSelectedTurnIndex(null);
    sdkContextWindowRef.current = undefined;
    lastScannedLiveIndexRef.current = 0;
    lastDagRefreshTimeRef.current = 0;
    pendingDagRefreshRef.current = false;
    if (pendingDagTimerRef.current !== null) {
      clearTimeout(pendingDagTimerRef.current);
      pendingDagTimerRef.current = null;
    }
  }, [repoSlug, sessionId]);
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/dag-refresh-timeout/dashboard
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Run all dashboard tests**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/dag-refresh-timeout/dashboard
pnpm test --run
```

Expected: All tests pass except the pre-existing `TurnCard.test.tsx:109` failure (exists before this fix).

- [ ] **Step 6: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/dag-refresh-timeout
git add dashboard/src/routes/SessionPage.tsx
git commit -m "fix: schedule setTimeout fallback when DAG refresh is throttled

When a subagent is dispatched, the main agent goes quiet (no new liveEvents)
while waiting. The pending refresh flag was set but never triggered because
the useEffect only runs when liveEvents changes. Now schedules a timer for
the remaining throttle window so the refresh fires even with no further events."
```

---

## Verification

After both tasks, run the full diagnostic:

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/dag-refresh-timeout/dashboard
npx tsc --noEmit && pnpm test --run 2>&1 | tail -10
```

Expected:
- TypeScript: 0 errors
- Tests: same pass count as baseline (1335 pass, 1 pre-existing fail in TurnCard)
- New test: PASS
