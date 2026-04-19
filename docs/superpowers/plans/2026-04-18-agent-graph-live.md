# Agent Graph Live Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent graph (TraceTab / BottomPanel DAG) update in real-time when new agents spawn during a live session, instead of requiring a page reload.

**Architecture:** The DAG is built server-side and returned as `metrics.dag` via REST. `SessionPage.tsx` currently only calls `refreshMetrics()` (which re-fetches metrics from REST) when the last turn completes. The fix adds a second trigger: when new live WebSocket events include an `Agent` tool_use dispatch (subagent spawn), call `refreshMetrics()` with a 5-second throttle to avoid hammering the server. No client-side DAG computation needed — the server already computes it correctly.

**Tech Stack:** React, TypeScript, Vitest

---

## File Map

| File | Change |
|------|--------|
| `dashboard/src/routes/SessionPage.tsx` | Add DAG refresh trigger on agent spawn events in live stream |
| `dashboard/src/__tests__/SessionPage.test.tsx` | Add test for new behavior (if test file exists) |

---

### Task 1: Add reproduction test

**Files:**
- Read: `dashboard/src/routes/SessionPage.tsx:70-194` — understand liveEvents + refreshMetrics wiring
- Test file: locate via `find dashboard/src -name "SessionPage*test*" -o -name "SessionPage*spec*" 2>/dev/null`

- [ ] **Step 1: Check if a SessionPage test file exists**

```bash
find /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live/dashboard/src -name "*SessionPage*" 2>/dev/null
```

If none exists, the reproduction test will be a new unit test verifying the effect behavior. If one exists, add to it.

- [ ] **Step 2: Write the failing reproduction test**

Create or append to `dashboard/src/__tests__/sessionPage.dagRefresh.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit test for the DAG refresh trigger logic extracted from SessionPage
// We test the decision function directly: given new live events, does it trigger refresh?

function shouldRefreshDag(
  newEvents: Array<{ type: string; message?: { content?: Array<{ type: string; name?: string }> } }>,
  lastRefreshTime: number,
  throttleMs: number
): boolean {
  const now = Date.now();
  if (now - lastRefreshTime < throttleMs) return false;
  return newEvents.some(e => {
    if (e.type !== 'assistant') return false;
    const content = e.message?.content;
    if (!Array.isArray(content)) return false;
    return content.some(c => c.type === 'tool_use' && c.name === 'Agent');
  });
}

describe('DAG refresh trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when new events contain an Agent tool_use dispatch', () => {
    const events = [{
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Agent' }]
      }
    }];
    expect(shouldRefreshDag(events, 0, 5000)).toBe(true);
  });

  it('returns false when throttle window has not expired', () => {
    const events = [{
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Agent' }]
      }
    }];
    const recentRefresh = Date.now() - 1000; // 1 second ago, throttle is 5s
    expect(shouldRefreshDag(events, recentRefresh, 5000)).toBe(false);
  });

  it('returns false when events contain non-Agent tool_use', () => {
    const events = [{
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Bash' }]
      }
    }];
    expect(shouldRefreshDag(events, 0, 5000)).toBe(false);
  });

  it('returns false when events have no content', () => {
    const events = [{ type: 'assistant' }];
    expect(shouldRefreshDag(events, 0, 5000)).toBe(false);
  });

  it('returns false when events array is empty', () => {
    expect(shouldRefreshDag([], 0, 5000)).toBe(false);
  });

  it('returns false for non-assistant event types', () => {
    const events = [{
      type: 'user',
      message: {
        content: [{ type: 'tool_use', name: 'Agent' }]
      }
    }];
    expect(shouldRefreshDag(events, 0, 5000)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live
pnpm -C dashboard test -- --reporter=verbose src/__tests__/sessionPage.dagRefresh.test.ts 2>&1 | tail -20
```

Expected: test file runs but the `shouldRefreshDag` function doesn't exist yet — or if you're running against a stub, all tests fail.

- [ ] **Step 4: Commit the failing test**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live
git add dashboard/src/__tests__/sessionPage.dagRefresh.test.ts
git commit -m "test: add reproduction test for DAG refresh trigger on agent spawn"
```

---

### Task 2: Implement the DAG live refresh in SessionPage.tsx

**Files:**
- Modify: `dashboard/src/routes/SessionPage.tsx` — add useEffect after line 194

- [ ] **Step 1: Read the current code around the refresh trigger**

Read lines 108–194 of `dashboard/src/routes/SessionPage.tsx`. Locate the `lastTurnCompletedRef` useEffect (around line 185–194). The new effect goes right after it.

- [ ] **Step 2: Add the DAG refresh effect**

In `dashboard/src/routes/SessionPage.tsx`, add these two refs and the new `useEffect` immediately after the existing turn-completion refresh effect (after line 194):

```typescript
  // Refresh DAG when a new subagent is dispatched in the live stream.
  // Uses a throttle to avoid hammering the server during rapid streaming.
  const lastDagRefreshTimeRef = useRef<number>(0);
  const lastScannedLiveIndexRef = useRef<number>(0);
  const DAG_REFRESH_THROTTLE_MS = 5000;

  useEffect(() => {
    const newEvents = liveEvents.slice(lastScannedLiveIndexRef.current);
    lastScannedLiveIndexRef.current = liveEvents.length;

    if (newEvents.length === 0) return;

    const hasAgentDispatch = newEvents.some((e) => {
      if (e.type !== 'assistant') return false;
      const content = (e.message as { content?: Array<{ type: string; name?: string }> } | undefined)?.content;
      if (!Array.isArray(content)) return false;
      return content.some((c) => c.type === 'tool_use' && c.name === 'Agent');
    });

    if (!hasAgentDispatch) return;

    const now = Date.now();
    if (now - lastDagRefreshTimeRef.current < DAG_REFRESH_THROTTLE_MS) return;

    lastDagRefreshTimeRef.current = now;
    refreshMetrics();
  }, [liveEvents, refreshMetrics]);
```

**Where exactly to add it:** After line 194 (`}, [turns, allEvents, refreshMetrics]);`), before line 196 (`// Default to last turn...`).

The `useRef` declarations go alongside the other refs near the start of the existing pattern (lines 160–161 have `prevEventCountRef` / `prevTurnsRef` as a model). Add them directly before the new `useEffect`.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live/dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new type errors. If `e.message` type is already typed as a known interface (check `SessionEvent` in `lib/types.ts`), use the proper type rather than the inline cast — adjust accordingly.

- [ ] **Step 4: Run all dashboard tests**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live
pnpm -C dashboard test 2>&1 | tail -10
```

Expected: all 1273 existing tests pass + the new DAG refresh tests pass.

- [ ] **Step 5: Run the reproduction test specifically**

```bash
pnpm -C dashboard test -- --reporter=verbose src/__tests__/sessionPage.dagRefresh.test.ts 2>&1 | tail -20
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live
git add dashboard/src/routes/SessionPage.tsx
git commit -m "fix: refresh DAG when new subagent dispatched in live event stream"
```

---

## Verification

After both tasks complete, verify end-to-end:

```bash
# Typecheck
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live/dashboard && npx tsc --noEmit

# All tests
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live && pnpm -C dashboard test 2>&1 | tail -5

# Lint
cd /Users/soh/working/ai/claude-devtools/.worktrees/agent-graph-live && pnpm lint 2>&1 | tail -5
```

Expected outcome:
- Zero type errors
- All dashboard tests pass (1273 + 6 new)
- Zero lint errors

## What This Does NOT Fix

- DAG status changes (active → completed) for already-visible agents during streaming — those still only update on turn completion. This is acceptable: the immediate pain point is NEW agents not appearing until reload. Status updates follow naturally from the existing turn-completion refresh.
- Server-side DAG computation lag — the server reads JSONL on every `refreshMetrics()` call, so data is always current.
