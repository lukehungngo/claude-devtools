# Plan: Fix turn-completed + agent-running divergence

**Date:** 2026-04-17
**Branch:** `fix/turn-agent-status-divergence`
**Brainstorm:** `docs/brainstorms/2026-04-17-turn-agent-status-divergence.md`
**Scope:** Narrow bug fix — close the user-visible divergence. Structural refactor is out of scope.

## Bug

TurnCard footer renders "Completed ✓" while one of the turn's agent pills shows a running (pulsing) dot. Same turn, same moment, contradictory.

Repro scenario (from brainstorm):
1. Session has a `turn_duration` system event for turn T, OR the last assistant on main has `stop_reason === "end_turn"`.
2. Some agent's last event in turn T is NOT a `stop_reason === "end_turn"` assistant event (e.g. main's last assistant stopped on `tool_use`, then `turn_duration` arrived; or subagent went quiet after a `tool_use`).
3. New events arrive via WS → the streaming fast path (`extendTurn`) runs.
4. `extendTurn` sets `turn.status = "completed"` but leaves agent status `"running"` (simple `end_turn` check, no `finalizeTurn`).
5. Render: TurnFooter "Completed ✓", AgentPills "running".

## Root Cause

Two defects in `dashboard/src/lib/turnSnapshot.ts`:

### Defect A: `extendTurn` never finalizes
`groupEventsIntoTurns` (the full rebuild path) calls `finalizeTurn(turns[i])` for every turn where `status === "completed"` (line 611-613). `finalizeTurn` flips any `agent.status === "running"` → `"completed"`.

`extendTurn` (the streaming incremental path, lines ~400-499) recomputes `turn.status` and agent statuses independently but NEVER invokes `finalizeTurn`. So when the streaming path flips turn to completed, agent statuses are not force-synced.

### Defect B: `adjustStatusForSubagents` ignores main agent
`adjustStatusForSubagents` (lines 115-123) reverts `turn.status` to `"running"` only when a non-main agent is running:
```ts
if (status === "completed" && agents.some(a => a.agentId !== "main" && a.status === "running")) {
  return "running";
}
```
If main agent is still running (e.g. `turn_duration` arrived but last main assistant had `stop_reason: "tool_use"`), `turn.status` stays `"completed"`. Turn says done, main pill pulses.

The hierarchy invariant (turn completed ⇒ all agents terminal) is enforced only by `finalizeTurn`, which Defect A prevents from running.

## Fix

One targeted change: make the invariant hold in both paths.

### Change 1 — `extendTurn` must finalize completed turns
At the end of `extendTurn` (after `adjustStatusForSubagents`), if `status === "completed"`, flip any `agent.status === "running"` to `"completed"` and set `completedAt` to `endTime`. This is exactly what `finalizeTurn` does — inline it or refactor `finalizeTurn` to accept the pre-return object. Simplest: extract a `finalizeAgentsIfCompleted(status, agents)` helper that mutates-in-place and is called in both `buildTurn` and `extendTurn` return paths.

Effect: streaming path now produces the same output as full rebuild.

### Change 2 — (no code change needed once Change 1 lands)
Change 1 subsumes Defect B at render time. Once the turn flips to completed, agents are synced. If a reviewer feels belt-and-suspenders is warranted: also update `adjustStatusForSubagents` to consider main — but this risks oscillation during active streaming (turn flipping back to running while main agent waits on tool result). Prefer the single fix in Change 1.

## Files

Modified:
- `dashboard/src/lib/turnSnapshot.ts` — extract helper, call it from both `buildTurn` and `extendTurn` return paths. Delete the duplicate inline finalization in `groupEventsIntoTurns` (or leave it; it's now defensive no-op).

Tests added:
- `dashboard/src/lib/turnSnapshot.test.ts` — three regression tests:
  1. **Incremental path finalizes agents**: build a turn via `extendTurn` where new events include a `turn_duration` but main's last assistant has `stop_reason: "tool_use"`. Assert `turn.status === "completed"` AND every `agent.status !== "running"`.
  2. **Incremental path finalizes subagents**: same as above with a subagent whose last assistant lacks `end_turn`.
  3. **Invariant: extendTurn ≡ buildTurn for the combined stream**: for the same event stream, `groupEventsIntoTurnsIncremental(existing, all, delta)` and `groupEventsIntoTurns(all)` must produce turns with identical `status` and agent `status` fields. This catches future divergences between the two paths.

## Out of Scope

- Single-reducer refactor (brainstorm's option 2, separate `/mas:dev-loop` work).
- Property-based tests with fast-check.
- Dev-mode invariant assertion at render boundary.
- Any change to `dag-builder.ts` or `TurnCard.tsx`.

## Verification

```bash
cd dashboard && pnpm test --run
cd dashboard && npx tsc --noEmit
```

Both must pass. Server tests and typecheck unchanged (no server files touched).

## Why this will not recur

Test 3 (the extensional-equality property) is the structural guard: if a future change drifts `extendTurn` from `groupEventsIntoTurns` in any way that affects status, that test fails immediately. It doesn't enumerate the scenarios — it enforces the invariant.
