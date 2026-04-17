# Brainstorm: Agent Graph timeline too small — main tiny, subagents full-width

**Date:** 2026-04-17
**Input type:** Observation
**Input (verbatim):** "why session de81c175-796c-483f-877c-d81ccac9029d, turn 9, IN AGENT GRAPH: agent main bearly show running bar and other agent show full running bar"

## Ground truth from the session data

Turn 9 main window (from main JSONL): `04:22:35 → 04:45:24`, duration ~22m 49s.

Subagents shown in the screenshot (from `subagents/agent-*.jsonl`):
- `Review synthetic` — 03:49:11 → 03:53:46 (4m 34s) — **pre-turn-9**
- `Reflect branch` — 04:01:45 → 04:05:49 (4m 4s) — **pre-turn-9**
- `Fix turn/agent` — 04:24:25 → 04:30:44 (6m 19s) — in turn 9
- `Review turn/agent` — 04:31:17 → 04:36:10 (4m 53s) — in turn 9

Image header shows ticks `0m … 1m` only → `totalMs ≈ 60_000`. But the real turn spans ~22 min. The timeline is vastly smaller than the turn, which is why 4–6 min subagent bars all clip to 100% (full bar) while main — whose duration-to-timeline ratio is near-zero under this broken bound — renders as a tiny pill.

## Assumptions challenged

| Assumption | Status | Evidence |
|---|---|---|
| Subagent events live inline in the main JSONL | FALSE | `server/src/parser/session-discovery.ts:200-240` loads `subagents/agent-*.jsonl` separately and merges by timestamp. Main JSONL for turn 9 has zero sidechain events. |
| `turn.endTime` = when the turn ended | FALSE | `turn.endTime = events[events.length-1]?.timestamp` — depends on what `currentEvents` contains at computation time. |
| `filterDagForTurn` scopes the DAG to the current turn's agents | PARTIAL | Filter is correct for main, but `activeTurn.agents` is built from `event.agentId`. Any subagent event that chronologically sits inside turn 9's window (even from a prior dispatch) ends up in turn 9's agents list. |
| Timeline bounds reflect the turn's wall-clock span | FALSE | `computeTimeline` (`TraceTab.tsx:100-110`) hard-codes `minMs = mainNode.startTime; maxMs = mainNode.endTime`. The "extend for recent active node" path at 134-146 extends only to `now`, not to beyond-main completed subagent spans. |

## Fundamentals

1. The visible timeline in Agent Graph must represent the **wall-clock span the user perceives** — from prompt to the last event by any agent in the turn.
2. Main's emission window ≠ turn duration. When main dispatches subagents and waits, the turn keeps running even though main is silent.
3. Silent clipping (`Math.min(rawWidth, 100 - leftPct)` in `computeBarPosition`) hides timeline miscomputation: a 4-min bar in a 1-min timeline LOOKS correct at full width, so nobody noticed.
4. Turn membership for subagents should be determined by "which main dispatched them", not by "does the timestamp fall in this turn's window".

## Root cause

### Defect 1 — Timeline bound = main only
`TraceTab.tsx:100-146`:
```ts
const mainNode = nodes.find((n) => n.id === "main");
if (mainNode?.startTime) {
  minMs = ...mainNode.startTime;
  maxMs = mainNode.endTime ? ...mainNode.endTime : Date.now();
}
```
Ignores subagent spans entirely. The "extend for active node within 5 min" heuristic only extends to `now`. A COMPLETED subagent whose endTime is beyond `maxMs` is never considered for timeline extension.

### Defect 2 — Main's endTime override uses turn.endTime
`filterDagForTurn.ts:60-62`:
```ts
const timeOverrides = isRoot
  ? { startTime: activeTurn.startTime || n.startTime, endTime: activeTurn.endTime || n.endTime }
  : {};
```
`activeTurn.endTime = last event timestamp in currentEvents`. If the dashboard captures a mid-turn snapshot where main has just dispatched Task tool_uses and subagent events haven't been flushed into `allEvents` yet (e.g., server didn't re-load subagent files, or WS lag), this value is early. Combined with Defect 1, the timeline becomes a sliver.

### Defect 3 — Subagent bleed-through between turns (adjacent bug)
`buildTurn` keys `agentMap` on `event.agentId ?? "main"`. Any subagent event that falls chronologically inside the current turn's event sweep gets added to `agentMap` regardless of which main-turn actually dispatched it. The screenshot shows `Review synthetic` and `Reflect branch` in turn 9 — both were dispatched in earlier turns. Their events leaked into turn 9 because they completed during turn 9's window.

## Solution direction — build up from fundamentals

Don't patch heuristics. Fix semantics.

### 1. Timeline = convex hull of all filtered nodes
`computeTimeline` should compute `[min(starts), max(ends, with bounded-now extension only for genuinely active nodes)]` over the WHOLE filtered node set. Main is not special. The "main-only" fast path should be deleted; the existing fallback loop at `TraceTab.tsx:113-123` should become the primary path.

### 2. Main's displayed span = the turn's wall-clock span
In `filterDagForTurn`, compute `minStart = min(all filtered nodes' startTime)` and `maxEnd = max(all filtered nodes' endTime, Date.now() if any is active)` and assign those to main's overrides. This matches what the user means by "the turn took N minutes".

### 3. Turn-membership by dispatch, not by timestamp
In `buildTurn`, track Task/Agent tool_use descriptions emitted by main events within this turn. A subagent is a member of this turn only if its agentId corresponds to a dispatch emitted in this turn's main events. Subagents that completed during this turn's window but were dispatched in an earlier turn don't belong in this turn's Agent Graph row.

### 4. Invariant assertion instead of silent clip
In `computeBarPosition`, if `rawWidth > 100 - leftPct` or `rawLeft < 0`, log a dev-mode warning. Silent clipping is what let this bug survive visually. Making it noisy in dev turns the next regression into an instant alarm.

### Why this won't recur

The whole pattern stops once the timeline equals the convex hull: bars can no longer exceed the timeline by construction. The invariant assertion in #4 catches any future code path that violates this. Defect 3 is a separate semantic (membership), solved by tracking dispatches.

## Concrete scenario that produces the current image

1. User sends turn 9 prompt at 04:22:35.
2. Main emits an `end_turn` assistant quickly (brief main work).
3. Subagents dispatched in turn 9 start running (04:24, 04:31) and finish 6 min later.
4. Meanwhile subagents from PRIOR turns (03:49, 04:01) also happen to live in the session cache.
5. When the dashboard renders the Agent Graph filtered to turn 9:
   - `activeTurn.endTime` gets set from the main events only (04:45 — eventually fine, but during streaming it was earlier).
   - `filterDagForTurn` overrides main's endTime to `activeTurn.endTime`.
   - `computeTimeline` bounds the timeline by main's `(startTime, endTime)`.
   - Whatever happens inside `[04:22, 04:45]` — any subagent that overlaps — gets rendered with its REAL spans.
   - At a mid-turn moment, main's endTime might be a minute into the turn (say 04:23:35). Timeline = 1 min.
   - Subagents that exist in the filtered set have spans that either overlap or precede that window. Their bars clip to 100%.
   - Main's own bar = its tiny duration relative to timeline = small pill.

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-agent-graph-timeline-bounds.md`

Your choice:

- `/mas:bug-fix fix Agent Graph timeline + main endTime per docs/brainstorms/2026-04-17-agent-graph-timeline-bounds.md` — narrow fix: compute timeline from convex hull of all filtered nodes; override main's endTime to max of filtered nodes' endTimes. Closes the user-visible bug.
- `/mas:dev-loop unify Agent Graph turn membership and timeline per docs/brainstorms/2026-04-17-agent-graph-timeline-bounds.md` — structural fix: adds dispatch-based turn membership (Defect 3) and the invariant assertion in `computeBarPosition`. Larger diff, kills the class of bug.

Recommend: bug-fix for Defects 1 & 2 (same PR, same file-family), then dev-loop for Defect 3 (turn membership) since that requires changes in `buildTurn` and has its own test surface.
