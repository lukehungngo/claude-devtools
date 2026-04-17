# Plan: Unify Agent Graph turn membership and timeline

**Date:** 2026-04-17
**Branch:** `feature/agent-graph-timeline-unify`
**Brainstorm:** `docs/brainstorms/2026-04-17-agent-graph-timeline-bounds.md`
**Scope:** Structural fix across two files. Small, focused, verifiable.

## Problem

Agent Graph (BottomPanel → Trace) shows:
- Main agent row as a tiny bar
- Subagent rows spanning full width
- Timeline ticks `0m … 1m` when the real turn spans ~22 minutes
- Subagents from PRIOR turns leak into the current turn's graph

Three root defects (per brainstorm):
- **D1** `TraceTab.computeTimeline` bounds the timeline by main's `(startTime, endTime)` only.
- **D2** `filterDagForTurn` overrides main's endTime to `activeTurn.endTime`, which can be mid-turn stale.
- **D3** `turnSnapshot.buildTurn` assigns events to turns by timestamp bucket. Subagents whose events chronologically land in the current turn's range get attached even when dispatched in a prior turn.

Plus: silent clipping in `computeBarPosition` hides D1/D2 visually.

## Principles (from brainstorm)

1. Timeline = convex hull of ALL filtered nodes, not just main.
2. Main's displayed span = min(starts) → max(ends) across the turn's real agents.
3. Turn membership = "dispatched by main in this turn's window", not "timestamp lands in this turn".
4. Silent clipping becomes a dev-mode warning.

## Tasks

### TASK-001 — Timeline convex hull + main endTime override

**Files:**
- `dashboard/src/components/bottom-panel/TraceTab.tsx`
- `dashboard/src/lib/filterDagForTurn.ts`
- `dashboard/src/components/bottom-panel/TraceTab.test.tsx` (new tests)
- `dashboard/src/lib/filterDagForTurn.test.ts` (new tests)

**Changes:**

1. In `TraceTab.tsx::computeTimeline`:
   - Delete the "main node fast path" at lines 104-124 (the block `const mainNode = ...; if (mainNode?.startTime) { ... } else { ... }`).
   - Replace with: scan ALL nodes unconditionally to compute `minMs = min(node.startTime)` and `maxMs = max(node.endTime || now)`.
   - Keep the existing "active + recent (< 5 min)" extension to `Date.now()`.
   - Keep fallback `DEFAULT_DURATION_MS` when no node has a timestamp.

2. In `filterDagForTurn.ts`:
   - Compute `groupStart = min(filtered nodes' startTime)` and `groupEnd = max(filtered nodes' endTime, or Date.now() if any is "active")`.
   - For the main node override, use:
     - `startTime = activeTurn.startTime || groupStart || n.startTime`
     - `endTime = max(activeTurn.endTime, groupEnd) || n.endTime`
   - Rationale: main's displayed row should span the turn's wall-clock range including subagent work. Using `max()` with the turn boundary preserves the turn-scoping intent when the turn itself is longer than the subagent envelope.

**Tests:**

Add to `TraceTab.test.tsx`:
- Export `computeTimeline` and `computeBarPosition` (if not already exported) so they can be unit tested; do NOT export new internals.
- **T-TIMELINE-1**: Three nodes — main (completed, 10m span), subA (completed, 6m starting at +2m), subB (completed, 4m starting at +7m). `computeTimeline` returns `maxMs = min + 10m` (main is widest), `minMs = min`.
- **T-TIMELINE-2**: Main completed with short span (1 min), subagent completed with longer span (5 min starting at min + 0s). `computeTimeline` returns `totalMs = 5 min` (subagent extends timeline), NOT `totalMs = 1 min` (main's span).
- **T-TIMELINE-3**: All nodes completed, main duration 20m, subagent fits inside. `computeBarPosition(main)` returns `widthPct = 100`, `leftPct = 0`. Subagent bar fits within main's span proportionally, not clipped.

Add to `filterDagForTurn.test.ts`:
- **T-FILTER-1**: activeTurn with `startTime` at T0 and `endTime` at T0+5m; subagent node in DAG with `endTime` at T0+10m (extends beyond turn). After filter, main's `endTime` = T0+10m (max of turn end and subagent end).
- **T-FILTER-2**: activeTurn.endTime empty (in-progress turn) and one subagent node with status `"active"` whose events are recent. Main's endTime is derived from `max(groupEnd, activeTurn.endTime)` where groupEnd uses `Date.now()` for the active node.

### TASK-002 — Turn membership by dispatch, not by timestamp

**Files:**
- `dashboard/src/lib/turnSnapshot.ts`
- `dashboard/src/lib/turnSnapshot.test.ts`

**Changes:**

1. In `buildTurn` (and `extendTurn`), track a `dispatchedAgentIds: Set<string>` computed from main events' `tool_use` items where `content.name === "Task"` OR `content.name === "Agent"`. The set is keyed by the `agentId` the SDK assigns to each dispatched subagent.

   Problem: the main event's `tool_use` carries a description but not the subagent's `agentId`. The SDK creates the subagent and Claude Code persists its events under that agentId in `subagents/agent-*.jsonl`. We need a mapping from `main's tool_use.description → subagent agentId`.

   Lookup path:
   - `subagentMeta` (passed into `groupEventsIntoTurns`) maps `agentId → { agentType, description }`.
   - In `buildTurn`, for each main-event `tool_use` (Task/Agent), find the matching entry in `subagentMeta` where `meta.description === tool_use.input.description`. Add that agentId to `dispatchedAgentIds`.
   - Fallback: if no match by description, check temporal proximity — a subagent whose first event timestamp is within 5 seconds AFTER the main tool_use timestamp is likely the dispatched agent (best-effort).
   - Always include `"main"` in `dispatchedAgentIds`.

2. When building `agentMap`, skip events whose `agentId` is not in `dispatchedAgentIds`. This prevents cross-turn bleed: subagents whose events happen to fall in this turn's window but were dispatched in a prior turn are excluded.

3. Keep existing time/status derivation otherwise unchanged. Don't touch `adjustStatusForSubagents`, `finalizeTurn`, etc. — those come from the previous bug-fix and should remain intact.

**Tests:**

Add to `turnSnapshot.test.ts`:
- **T-DISPATCH-1**: Build a multi-turn stream: turn 1 dispatches subagent A (via Task tool_use); turn 2 is a plain main-only turn; subagent A's LAST event (completion) happens chronologically inside turn 2's window. Assert turn 2's agents list does NOT include subagent A, and turn 1's agents list DOES include it.
- **T-DISPATCH-2**: Turn with no Task dispatch but a subagent event somehow in the event stream (defensive case). Assert turn's agents list is `[main]` only.
- **T-DISPATCH-3**: Description-based match: main tool_use description = "Fix the foo bug", subagentMeta has `agentId-xyz → { description: "Fix the foo bug" }`. Assert dispatched set includes `agentId-xyz`.
- **T-DISPATCH-4**: Temporal-proximity fallback: main tool_use at T, subagent first event at T+2s with NO description match. Assert dispatched set includes that agentId.

### TASK-003 — Dev-mode bar clip warning (invariant assertion)

**Files:**
- `dashboard/src/components/bottom-panel/TraceTab.tsx`
- `dashboard/src/components/bottom-panel/TraceTab.test.tsx`

**Changes:**

In `computeBarPosition`, before returning, check:
- `rawLeft < -1` (not just `< 0` because tiny floating-point error is OK) → bar starts before timeline
- `rawLeft + rawWidth > 101` → bar ends after timeline
- When either is true AND `import.meta.env.DEV === true`, emit a dev-only console warning with the node id and diagnostic (`nodeStart`, `nodeEnd`, `timelineStart`, `timelineEnd`, `rawLeft`, `rawWidth`).

No behavior change in production. No change to the actual bar rendering (still clamped to `[0, 100]`).

**Tests:**

- **T-WARN-1**: In a Vitest test with `DEV=true` (default for vitest), call `computeBarPosition(nodeThatExceedsTimeline, minMs, totalMs)` and assert `console.warn` was called once with a message containing the node id. Use `vi.spyOn(console, 'warn').mockImplementation(() => {})`.
- **T-WARN-2**: With a node whose bar fits entirely within the timeline, assert `console.warn` was NOT called.

## File Overlap

| Task | Files touched |
|------|---------------|
| TASK-001 | TraceTab.tsx, filterDagForTurn.ts, TraceTab.test.tsx, filterDagForTurn.test.ts |
| TASK-002 | turnSnapshot.ts, turnSnapshot.test.ts |
| TASK-003 | TraceTab.tsx, TraceTab.test.tsx |

TASK-001 and TASK-003 both touch `TraceTab.tsx` + `TraceTab.test.tsx`. They run **sequentially** (same batch would conflict).

TASK-002 touches only turnSnapshot files — can run in parallel with TASK-001 or TASK-003.

Dispatch order:
1. Batch A: TASK-001 + TASK-002 (parallel, non-overlapping files)
2. Batch B: TASK-003 (after TASK-001 completes to avoid conflict)
3. Review all three (single reviewer, 3 tasks, within TASKS_PER_REVIEWER=5 cap)

## Verification

```bash
cd dashboard && pnpm test --run
cd dashboard && npx tsc --noEmit
```

- All tests must pass (1159 + new ones).
- 4 pre-existing tsc errors unchanged.
- New tests exercise each defect's fix.

## Out of Scope

- Server-side changes (this fix is dashboard-only; DAG builder already passes correct per-subagent data).
- Refactoring existing `adjustStatusForSubagents` / `finalizeTurn` — the prior bug-fix pattern stays.
- Removing the 5-min stale-active extension; not the source of the visible bug.
- Property-based testing harness (scope creep).

## Success criteria

1. `TraceTab.computeTimeline` uses max/min across all nodes → timeline encompasses every agent's span.
2. `filterDagForTurn` main override uses the group's endTime max → main bar spans the turn.
3. `turnSnapshot.buildTurn` uses dispatch membership → prior-turn subagents no longer bleed in.
4. Dev-mode warning fires when a bar would exceed the timeline → silent clipping is detectable.
5. For the brainstorm's concrete scenario (turn 9 of session `de81c175`), the graph shows main with a full-width bar, only the 2 turn-9 subagents (not the 2 earlier ones), and ticks that reflect the ~22-minute real duration.
