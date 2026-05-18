# Subagent Turn Attribution Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where subagent events from a prior turn leak into a later turn's Agent Graph because `eventAgentIds` indiscriminately collects every `agentId` from the merged event stream regardless of which turn dispatched the subagent.

**Architecture:** Replace `eventAgentIds` (which adds every agentId from every event) with `dispatchedAgentIds` (which only adds agents that were dispatched within this turn). The dispatch heuristic (`computeDispatchedAgentIds`) already correctly identifies which agents belong to which turn via `parent_tool_use_id`, description matching, and temporal proximity. We just need to use it as the DAG membership source instead of the raw event scan.

**Tech Stack:** TypeScript, Vitest, React (dashboard)

---

## Root Cause

The server merges main + subagent events into one flat array sorted by timestamp (`session-routes.ts:254`). When `groupEventsIntoTurns` runs on the client, it splits this merged stream at turn boundaries. A subagent dispatched in T10 but whose events have timestamps overlapping T11 gets its events placed into T11's event array. `eventAgentIds` (line 369-373 of `turnSnapshot.ts`) then adds that subagent's ID to T11's agent set. `filterDagForTurn` uses `eventAgentIds` to decide which agents to show → T11's Agent Graph displays T10's subagents.

## The Fix

`eventAgentIds` should be replaced with `dispatchedAgentIds` as the authoritative source for `filterDagForTurn`. The `dispatchedAgentIds` set is already computed correctly — it only includes agents whose dispatch (a `Task` or `Agent` tool_use on the main thread) occurred within THIS turn's events. It uses three strategies: (1) `parent_tool_use_id` structural match, (2) description match against subagentMeta, (3) temporal proximity fallback. All three are scoped to the current turn.

## File Structure

```
dashboard/src/lib/
├── turnSnapshot.ts        # MODIFY: use dispatchedAgentIds for DAG membership
├── filterDagForTurn.ts    # MODIFY: read dispatchedAgentIds instead of eventAgentIds
└── filterDagForTurn.test.ts  # MODIFY: add cross-turn leak regression test
```

---

### Task 1: Change filterDagForTurn to use dispatchedAgentIds

**Files:**
- Modify: `dashboard/src/lib/filterDagForTurn.ts:80`
- Modify: `dashboard/src/lib/filterDagForTurn.test.ts`

- [ ] **Step 1: Write the failing regression test**

Add a test to `dashboard/src/lib/filterDagForTurn.test.ts` that reproduces the cross-turn leak:

```typescript
it("does not show subagents from a prior turn that leaked via timestamp sort", () => {
  // Simulate: T10 dispatched subagent "agent-abc". Its events leaked into T11's
  // event array via timestamp sort. T11 did NOT dispatch any subagents.
  // eventAgentIds would include "agent-abc" (bug). dispatchedAgentIds would not (fix).
  const dag: AgentDAG = {
    nodes: [
      { id: "main", type: "main", status: "completed", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T01:00:00Z", tokenUsage: { inputTokens: 100, outputTokens: 50, totalCost: 1 }, toolCalls: 5, mcpToolCalls: 0, description: "Main" },
      { id: "agent-abc", type: "engineer", status: "completed", startTime: "2026-01-01T00:10:00Z", endTime: "2026-01-01T00:30:00Z", tokenUsage: { inputTokens: 200, outputTokens: 100, totalCost: 2 }, toolCalls: 10, mcpToolCalls: 0, description: "Task 1" },
    ],
    edges: [{ source: "main", target: "agent-abc" }],
  };

  // T11's turn snapshot: agent-abc's events leaked in via timestamp,
  // so eventAgentIds has it, but dispatchedAgentIds does NOT.
  const t11Turn: TurnSnapshot = {
    turnNumber: 11,
    prompt: "/e2e rebuild",
    events: [],
    startTime: "2026-01-01T00:35:00Z",
    endTime: "2026-01-01T00:40:00Z",
    agents: [{ agentId: "main", tokensIn: 50, tokensOut: 20, cost: 0.5, tools: [] }],
    eventAgentIds: new Set(["main", "agent-abc"]),       // BUG: leaked
    dispatchedAgentIds: new Set(["main"]),                // CORRECT: not dispatched here
    // ... fill other required TurnSnapshot fields with defaults
  } as unknown as TurnSnapshot;

  const result = filterDagForTurn(dag, t11Turn);

  // With the fix, agent-abc should NOT appear — it was not dispatched in T11
  expect(result!.nodes.map(n => n.id)).toEqual(["main"]);
  expect(result!.edges).toEqual([]);
});
```

- [ ] **Step 2: Run test, verify it FAILS**

Run: `pnpm -C dashboard test dashboard/src/lib/filterDagForTurn.test.ts`
Expected: FAIL — the test expects only `["main"]` but the current code returns both `["main", "agent-abc"]` because it reads `eventAgentIds`.

- [ ] **Step 3: Fix filterDagForTurn to use dispatchedAgentIds**

In `dashboard/src/lib/filterDagForTurn.ts`, line 80, change:

```typescript
// BEFORE (bug):
const turnAgentIds = new Set(activeTurn.eventAgentIds);

// AFTER (fix):
const turnAgentIds = new Set(activeTurn.dispatchedAgentIds);
```

That's it. One line change. The `dispatchedAgentIds` set already exists on every `TurnSnapshot` and is already correctly computed by `computeDispatchedAgentIds`.

- [ ] **Step 4: Run test, verify it PASSES**

Run: `pnpm -C dashboard test dashboard/src/lib/filterDagForTurn.test.ts`
Expected: PASS

- [ ] **Step 5: Run full dashboard test suite**

Run: `pnpm -C dashboard test`
Expected: All tests pass. If any existing tests relied on `eventAgentIds` including leaked agents, they need to be updated to use `dispatchedAgentIds` semantics.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/filterDagForTurn.ts dashboard/src/lib/filterDagForTurn.test.ts
git commit -m "fix: use dispatchedAgentIds for Agent Graph turn scoping — prevents cross-turn subagent leak"
```

---

### Task 2: Update eventAgentIds comment to reflect new role

**Files:**
- Modify: `dashboard/src/lib/turnSnapshot.ts:82-91`

The comment on `eventAgentIds` currently says it's "the authoritative source for which agents participated in a turn" and is "Used by `filterDagForTurn` for DAG membership." This is no longer true after Task 1.

- [ ] **Step 1: Update the JSDoc comment**

In `dashboard/src/lib/turnSnapshot.ts`, replace lines 82-91:

```typescript
// BEFORE:
  /**
   * Set of unique agentIds found in the turn's events (via event.agentId).
   * Always includes "main". Unlike `dispatchedAgentIds` (which uses the
   * heuristic dispatch-detection that can miss agents), this set is derived
   * directly from the events and is the authoritative source for which agents
   * participated in a turn. Used by `filterDagForTurn` for DAG membership.
   *
   * Populated by both `buildTurn` and `extendTurn` in O(newEvents) time.
   */
  eventAgentIds: Set<string>;

// AFTER:
  /**
   * Set of unique agentIds found in the turn's events (via event.agentId).
   * Always includes "main". WARNING: in merged event streams (main + subagent
   * events sorted by timestamp), this set may include agents dispatched by a
   * DIFFERENT turn whose events happen to fall within this turn's time window.
   * Do NOT use for Agent Graph membership — use `dispatchedAgentIds` instead,
   * which only includes agents whose dispatch tool_use occurred in this turn.
   *
   * Retained for backward compatibility (e.g. token aggregation that needs
   * to sum across all events regardless of dispatch origin).
   */
  eventAgentIds: Set<string>;
```

- [ ] **Step 2: Update the filterDagForTurn JSDoc**

In `dashboard/src/lib/filterDagForTurn.ts`, update the function's doc comment (lines 57-71) to reflect the change:

```typescript
// BEFORE (line 63-64):
 * Uses TurnSnapshot.eventAgentIds (derived from event agentIds) as the
 * primary membership source.

// AFTER:
 * Uses TurnSnapshot.dispatchedAgentIds (derived from dispatch heuristic) as
 * the primary membership source. This prevents cross-turn bleed where a
 * subagent dispatched in turn N has events that fall into turn N+1's time
 * window due to timestamp-sorted merging of the event stream.
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/lib/turnSnapshot.ts dashboard/src/lib/filterDagForTurn.ts
git commit -m "docs: update comments — dispatchedAgentIds is now the DAG membership source"
```

---

### Task 3: Verify with real session data

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev servers**

```bash
pnpm -C server dev &
pnpm -C dashboard dev &
```

- [ ] **Step 2: Open session 99f1009a in the dashboard**

Navigate to session `99f1009a-0404-4efb-b4d3-a3b8fb8f5d81`. Click on T11 (`/e2e rebuild and reload all images`) in the turn history.

**Expected:** Agent Graph shows ONLY `main` — no subagent rows. T11 dispatched zero subagents (confirmed from JSONL: zero `Agent` tool calls in T11's events).

**Before fix:** Agent Graph shows 40+ subagents from T10's pipeline leaking in.

- [ ] **Step 3: Click on T10 (`1`)**

**Expected:** Agent Graph shows `main` + all subagents dispatched by the subagent-driven-development pipeline (Task 1, Spec review Task 1, Quality review Task 1, etc.). These agents were dispatched in T10 via `Agent` tool_use calls.

- [ ] **Step 4: Verify T12+ are clean**

Click through T12-T17. None dispatched subagents. All should show only `main` in the Agent Graph.

- [ ] **Step 5: Run full test suite**

```bash
pnpm -C server test && pnpm -C dashboard test
```

Expected: all pass.

---

## Self-Review

**Root cause coverage:** The one-line fix (`eventAgentIds` → `dispatchedAgentIds` in `filterDagForTurn.ts:80`) directly addresses the confirmed root cause. `dispatchedAgentIds` uses `parent_tool_use_id` (authoritative), description matching (fallback), and temporal proximity (last resort) — all scoped to the current turn's events.

**Risk assessment:** `eventAgentIds` was labeled "authoritative" in the codebase. Switching to `dispatchedAgentIds` could miss agents if the dispatch heuristic fails (e.g., no `parent_tool_use_id`, no matching description, and temporal proximity window expired). However, `dispatchedAgentIds` already has three fallback strategies and a synthetic-ID fallback for agents with no events. The cross-turn leak is a worse failure mode than a missed agent — a leaked agent shows wrong data, while a missed agent shows no data (which is at least not misleading).

**Placeholder scan:** No placeholders. All code is concrete.

**Type consistency:** `dispatchedAgentIds` is already a `Set<string>` on `TurnSnapshot` — same type as `eventAgentIds`. No type changes needed.
