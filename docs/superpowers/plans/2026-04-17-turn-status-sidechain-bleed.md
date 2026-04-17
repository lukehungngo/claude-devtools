# Plan: Fix turn status flipping on subagent end_turn

**Date:** 2026-04-17
**Branch:** `fix/turn-status-sidechain-bleed`
**Brainstorm:** `docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md`
**Scope:** Narrow bug fix — deferred P2-2 from PR #28. Do NOT refactor to a central `mainEventsOnly(events)` helper; that's the structural dev-loop option and intentionally separate.

## Bug

User symptom: "i always see the last turn state is completed, it's always like that".

`TurnFooter` / `turn.status` reads "completed" on the currently-running turn during live multi-agent sessions.

## Root Cause

`dashboard/src/lib/turnSnapshot.ts` has two status-derivation loops that walk events backward and take the first assistant event found:

- `buildTurn` lines 262-272 (full rebuild path)
- `extendTurn` lines 442-450 (streaming incremental path)

Both iterate through `events` (which merges main + sidechain chronologically) and `break` on the first `event.type === "assistant"`. Neither filters by `isSidechain`. Subagents finish with `stop_reason === "end_turn"`, so whenever the merged stream's last assistant event is a subagent's end_turn (very common during live sessions — there's a window between "subagent done" and "main resumes"), the reducer flags the turn as completed.

The same loop pattern also causes the "cross-turn leak" variant: a prior-turn subagent's end_turn lands chronologically inside a later turn's window → later turn flips completed.

## Fix

Exactly two call sites, minimal change.

### File: `dashboard/src/lib/turnSnapshot.ts`

In `buildTurn` (lines ~262-272):
```ts
if (status === "running") {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "assistant" && !events[i].isSidechain) {
      const asst = events[i] as AssistantEvent;
      if (asst.message?.stop_reason === "end_turn") {
        status = "completed";
      }
      break;
    }
  }
}
```

In `extendTurn` (lines ~442-450): same change. Note the scan is over `newEvents` in extendTurn; same `!isSidechain` guard applies.

That's the entire production change.

### Leave alone

- `adjustStatusForSubagents` — still valid; it acts after turn status is derived.
- `finalizeTurn` — still valid and idempotent.
- Per-agent status derivation (lines 284-289 and 453-460) — an AGENT's status is correctly derived from that agent's own events. The bug is only in the TURN's status.
- `turn_duration` system-event scanner (lines 255-261 / 424-430) — `turn_duration` is emitted by the SDK for the main turn only. System events don't have `isSidechain`. Verify with a test; do not modify.
- `computeDispatchedAgentIds` from PR #28 — orthogonal, untouched.

## Tests

Add to `dashboard/src/lib/turnSnapshot.test.ts` under a new `describe("Turn status ignores subagent end_turn")` block.

- **T-TURNSTATUS-1** `subagent end_turn does not complete the parent turn`: Build a stream: user prompt, main assistant with `Task` tool_use (matches `subagentMeta` for `subA`), then a sidechain assistant event with `agentId: "subA"` and `stop_reason: "end_turn"`. Main has NOT emitted another event with end_turn. Call `groupEventsIntoTurns(events, meta)`. Assert `turns[0].status === "running"`.

- **T-TURNSTATUS-2** `main end_turn completes the turn even if a later subagent also ends with end_turn`: Stream: user, main `tool_use`, sidechain subagent with `end_turn`, main assistant with `end_turn`. Assert `turns[0].status === "completed"` (main's own end_turn wins; this isn't the bug path, just the happy-path regression guard).

- **T-TURNSTATUS-3** `extendTurn streaming path also ignores subagent end_turn`: Build initial turn via `groupEventsIntoTurns` (running, main still working). Feed to `groupEventsIntoTurnsIncremental` a delta that is just a sidechain subagent `end_turn` event. Assert the resulting turn's status is STILL `"running"`, not flipped to `"completed"`.

- **T-TURNSTATUS-4** `cross-turn bleed: prior-turn subagent end_turn does not flip a later turn`: Two turns. Turn 1: user prompt, main `tool_use` dispatching subA, subA's events including its final end_turn at timestamp T1_end. Turn 2: user prompt at T2 > T1_end (normal sequence), main has emitted one `tool_use` but no `end_turn` yet. Add ONE more sidechain event at timestamp T_in_turn_2 that belongs to subA but was buffered late (agentId subA, stop_reason end_turn). Assert `turns[1].status === "running"` — the prior-turn subA's end_turn must not flip turn 2.

These 4 tests — T-1 + T-3 cover the primary symptom (buildTurn + extendTurn), T-2 is a happy-path guard, T-4 catches the cross-turn variant. Mentally reverting the fix: T-1, T-3, T-4 all fail. That's the regression signal.

## Optional dev-mode assertion (included; tiny)

In both reducer loops, when `status` is set to `"completed"`, if `import.meta.env.DEV === true` add a `console.warn` when the triggering event has `isSidechain === true`. This is belt-and-suspenders: the guard prevents the flip, but if someone ever reintroduces the bug by removing the filter, this fires loudly at runtime.

Skip if it adds more than 6 lines total across both sites. The behavioral fix is the guard; the assertion is a nice-to-have.

## Out of Scope

- Central `mainEventsOnly(events)` helper / structural cleanup — intentional separate `/mas:dev-loop` (brainstorm option 2).
- Any change to `filterDagForTurn`, `TraceTab`, or DAG builder.
- Server-side changes.
- Property-based tests.

## Verification

```bash
cd dashboard && pnpm test --run
cd dashboard && npx tsc --noEmit
```

All must pass. 4 pre-existing tsc errors unchanged. +4 new tests (1174 → 1178 minimum).

## Why this won't recur

T-1, T-3, T-4 are targeted regression signals. If a future change removes or weakens the `!isSidechain` guard, tests fail before ship. T-2 guards the inverse (main's own end_turn still completes). Four small tests cover the class.
