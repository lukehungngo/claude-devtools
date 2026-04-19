# Brainstorm: Subagent shows "running" after session ended without completion

**Date:** 2026-04-17
**Input type:** Problem
**Input:** Session shows "Session ended without completion" in conversation footer, but a subagent in the TraceTab still shows "running" with a pulsing dot.

---

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| The "Session ended without completion" text comes from `TurnCard.tsx` via `getAgentStatus` with `sessionIsRunning=false` | CONFIRMED | `TurnCard.tsx:117–118`: `const sessionIsActive = sessionIsRunning !== false; const status = getAgentStatus("main", turnEvents, sessionIsActive)` → `"indeterminate"` |
| The "running" label in TraceTab comes from `node.status === "active"` | CONFIRMED | `TraceTab.tsx:377`: `const isActive = node.status === "active"` |
| `node.status` is set in `dag-builder.ts` via `deriveStatus()` | CONFIRMED | `dag-builder.ts:147,180`: `status: deriveStatus(agentId, events, hasError)` |
| `deriveStatus` does NOT receive `sessionIsRunning` | CONFIRMED | `dag-builder.ts:111–118`: signature is `(agentId, events, hasError)`, returns `"active"` when `isAgentCompleted = false` |
| `sessionInfo.isRunning` is available in `metrics.ts` when `buildAgentDAG` is called | CONFIRMED | `metrics.ts:274` builds DAG, `metrics.ts:288` reads `isActive`; `sessionInfo.isRunning` is on the same object |
| `getAgentStatus` correctly handles `sessionIsActive=false` → `"indeterminate"` | CONFIRMED | `agentStatus.ts:200–208`: if `!sessionIsActive` returns `"indeterminate"` |
| `sessionInfo.isRunning` = mtime < 2-minute threshold | CONFIRMED | `session-cache.ts:32`: `RUNNING_THRESHOLD_MS = 2 * 60 * 1000` |

---

## Fundamentals

### What `TurnCard` does (correct)

```
sessionIsRunning = false (mtime > 2min)
→ sessionIsActive = false
→ getAgentStatus("main", events, false)
→ isAgentCompleted("main", events) = false (no end_turn / turn_duration)
→ "indeterminate"
→ renders "Session ended without completion" ✓
```

### What `deriveStatus` in dag-builder does (wrong)

```
deriveStatus(subagentId, mergedEvents, hasError=false)
→ isAgentCompleted(subagentId, mergedEvents) = false (no end_turn, no parent ack)
→ returns "active"    ← BUG: no session-level context
→ node.status = "active"
→ TraceTab: isActive = true → shows "running" ✗
```

### The gap

`getAgentStatus(agentId, events, sessionIsActive)` already handles this — it's the single-source predicate. But `deriveStatus` bypasses it and calls `isAgentCompleted` directly, discarding the `sessionIsActive` dimension entirely.

`AgentNode.status` has no `"indeterminate"` value (`"active" | "completed" | "error"`), so the correct mapping is: `"indeterminate"` → `"completed"` (session closed, agent no longer running regardless of terminal signal).

---

## Output — Root Cause (confirmed)

**Single root cause: `deriveStatus` in `dag-builder.ts` ignores session-level activity.**

`buildAgentDAG` is called without `sessionIsRunning`. `deriveStatus` uses `isAgentCompleted` directly instead of `getAgentStatus`. For any subagent that:
- Has no `end_turn` (stopped mid-computation when main session was killed)
- Has no parent `tool_result` ack (main never processed the result before aborting)

...`deriveStatus` returns `"active"` even though the session is dead. TraceTab then shows "running" forever.

**The fix (3 lines):**

1. `metrics.ts:274` — pass `sessionInfo.isRunning ?? false` to `buildAgentDAG`
2. `dag-builder.ts:120` — add `sessionIsRunning: boolean = true` param to `buildAgentDAG`
3. `dag-builder.ts:111–118` — `deriveStatus` uses `getAgentStatus`; maps `"indeterminate"` → `"completed"`

```typescript
// dag-builder.ts
function deriveStatus(
  agentId: string,
  events: readonly SessionEvent[],
  hasError: boolean,
  sessionIsRunning: boolean,
): "active" | "completed" | "error" {
  if (hasError) return "error";
  const status = getAgentStatus(agentId, events, sessionIsRunning);
  return status === "running" ? "active" : "completed";
}

export function buildAgentDAG(
  mainEvents: SessionEvent[],
  subagentEvents: Map<string, SessionEvent[]>,
  subagentMeta: Map<string, { agentType: string; description: string }>,
  sessionIsRunning: boolean = true,
): AgentDAG { ... }
```

```typescript
// metrics.ts
const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta, sessionInfo.isRunning ?? false);
```

**No dashboard changes needed.** The DAG is pre-computed server-side (Architecture Invariant #4). The fix lives entirely in `server/src/analyzer/`.

**Invariant preserved:** `getAgentStatus` remains the single status predicate. `deriveStatus` now delegates to it instead of calling `isAgentCompleted` directly — closing the bypass.

---

## Next Steps

```
/mas:dev-loop fix subagent running after session ended — see docs/brainstorms/2026-04-17-subagent-running-after-session-ended.md
```
