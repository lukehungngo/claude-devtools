# Brainstorm: New Agent Not Visible in Graph Without Reload

**Date:** 2026-04-19
**Input type:** Problem (regression — prior fix was partial)
**Input:** "why i need to reload to see new agent in the graph"
**Prior art:** `docs/brainstorms/2026-04-18-agent-graph-not-live.md`

## Context

The April 18 brainstorm confirmed the root cause: `metrics.dag` only refreshed on turn completion, disconnected from the live WS stream. A partial fix was added: a `pendingDagRefreshRef` mechanism in `SessionPage.tsx` that detects Agent dispatches in `liveEvents` and calls `refreshMetrics()` with a 5s throttle. This is the mechanism that is supposed to make the graph live. It still doesn't work.

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| The throttle mechanism fires correctly | QUESTIONED | Throttle logic runs inside a `useEffect([liveEvents])` — only fires when `liveEvents` changes |
| liveEvents keeps updating while subagent runs | QUESTIONED | WS watches main JSONL; main agent blocks waiting for subagent — no new main events during subagent execution |
| Subagent JSONL events flow into liveEvents | QUESTIONED | `useEventStream` subscribes to the current session file path only |
| The 5s throttle unblocks after 5s automatically | QUESTIONED | There is no `setTimeout` — deferred refresh relies on the next `liveEvents` change to fire |

## Fundamentals

### Truth 1: The deferred refresh is a dead man's switch that never fires

The refresh trigger logic (`SessionPage.tsx` ~L228–249):

```typescript
useEffect(() => {
  const newEvents = liveEvents.slice(lastScannedLiveIndexRef.current);
  lastScannedLiveIndexRef.current = liveEvents.length;
  if (newEvents.length === 0) return;          // ← GATE 1

  if (newEvents.some(isAgentDispatch)) {
    pendingDagRefreshRef.current = true;
  }

  if (!pendingDagRefreshRef.current) return;
  if (now - lastRefreshTime < 5000) return;    // ← GATE 2 (throttle)

  pendingDagRefreshRef.current = false;
  refreshMetrics();                            // ← never reached during subagent run
}, [liveEvents, refreshMetrics]);
```

Step-by-step for the typical "new agent appears" scenario:

1. Main agent calls `Agent()` — AssistantEvent with `tool_use.name === "Agent"` arrives in liveEvents
2. `pendingDagRefreshRef.current = true` — good
3. Throttle check: last refresh was < 5s ago (initial load) → returns early — expected
4. Main agent is now **blocked waiting for subagent** → no new main-JSONL events
5. `liveEvents` does not change → `useEffect` does not run again
6. `pendingDagRefreshRef.current === true` but nothing ever calls `refreshMetrics()`
7. User must reload

**The fix was: "if throttled, set pending flag and retry on the next event." The bug is: the next event from the main agent never arrives while the subagent is running.**

### Truth 2: Main JSONL is silent during subagent execution

The WS watcher watches `~/.claude/projects/<hash>/<sessionId>.jsonl` — the main session file. While a subagent runs, the main agent emits nothing. The subagent writes to its own JSONL (`subagents/<uuid>.jsonl`). The WS does not watch subagent files. So for potentially minutes, `liveEvents` stays frozen.

### Truth 3: The throttle window (5s) is not implemented with a timer

The 5s throttle is purely reactive: it returns early if called too soon. There is no `setTimeout(() => refreshMetrics(), remainingThrottleMs)` fallback. Once the main agent goes quiet, the deferred refresh is silently dropped.

### Truth 4: Backend DAG correctly includes new subagents when asked

`buildAgentDAG()` loads all subagent JSONL files from `subagentEvents`. If `refreshMetrics()` were called after the subagent JSONL appears, the new node would show up. The problem is purely the trigger failing to fire.

## Output

### Root Cause (confirmed)

**The pending DAG refresh depends on `liveEvents` changing to fire. While a subagent runs, the main agent emits no new events (main JSONL is frozen). The deferred refresh never fires because the triggering condition (`liveEvents` update) cannot occur while the subagent executes.**

This is a dead man's switch bug: the retry mechanism was designed to "retry on next event," but the next event from the main agent does not arrive until the subagent completes — which is exactly when the new node is no longer "new."

### Fix Direction

**Option A — `setTimeout` fallback inside the useEffect (minimal, correct)**

When the throttle blocks an immediate refresh, schedule it for after the throttle window:

```typescript
if (!pendingDagRefreshRef.current) return;
const elapsed = Date.now() - lastDagRefreshTimeRef.current;
if (elapsed < DAG_REFRESH_THROTTLE_MS) {
  // Schedule the deferred refresh independently of future events
  setTimeout(() => {
    if (!pendingDagRefreshRef.current) return;
    pendingDagRefreshRef.current = false;
    lastDagRefreshTimeRef.current = Date.now();
    refreshMetrics();
  }, DAG_REFRESH_THROTTLE_MS - elapsed);
  return;
}
pendingDagRefreshRef.current = false;
lastDagRefreshTimeRef.current = Date.now();
refreshMetrics();
```

Clear the timer on session change. This makes the deferred refresh timer-driven, not event-driven.

**Option B — Also watch subagent JSONL files on the server (correct, more powerful)**

Have the WS watcher subscribe to subagent JSONL files as well. Each new event from a subagent would update `liveEvents`, which would trigger the existing useEffect, which would then trigger the refresh. This also enables live subagent event streaming but is a larger change.

**Option C — Poll on a short interval when there's a pending agent**

When `pendingDagRefreshRef.current === true`, poll `refreshMetrics()` every 3s until the subagent completes (DAG node count stabilizes). Wasteful but simple.

### Recommendation

**Option A** is the minimal, correct fix. It requires a single `setTimeout` call and a cleanup ref. It makes the mechanism timer-driven as it should have been, and unblocks the user-visible problem immediately.

**Option B** is the right long-term architecture (live subagent events) but is a separate PR.

## Next Steps

```
/mas:bug-fix fix the pending DAG refresh to use setTimeout fallback — see docs/brainstorms/2026-04-19-agent-graph-reload-required.md
```
