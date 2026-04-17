# Brainstorm: turn status flips to "completed" on subagent end_turn

**Date:** 2026-04-17
**Input type:** Observation + diagnostic question ("is this the same problem?")
**Input (verbatim):** "I deferred (P2-2): the turn-status-derivation loop in turnSnapshot.ts still scans all events for last end_turn, including non-dispatched sidechain ones. A rogue prior-turn sidechain end_turn landing late could flip a running turn to completed. … I this the same problem with i always see the last turn state is completed, it's always like that"

## Short answer

Yes. Same bug. The "last turn always shows completed" symptom and the deferred P2-2 are one defect with two visible shapes:
- **Live**: subagent finishes with `end_turn` while main is still running → turn reads completed until main emits its next event.
- **Historical/cross-turn**: a sidechain `end_turn` from a prior turn lands chronologically inside the current turn's window → turn reads completed.

Same root cause, same fix.

## Assumptions (challenged)

| Assumption | Status | Evidence |
|---|---|---|
| The status reducer considers only main events | **FALSE** | `turnSnapshot.ts:262-272` and `:442-450` iterate `events` backward and `break` on the first assistant found. No `isSidechain` filter. |
| Subagents don't emit `end_turn` | **FALSE** | Subagents finish with `stop_reason === "end_turn"` per SDK contract. The sidechain JSONLs are full of them. |
| Finding "last assistant" is sufficient for turn status | **FALSE** | Events merge main + sidechain chronologically. The last assistant in the stream is often a subagent's `end_turn` during live sessions. |
| This is a display/refresh bug | **FALSE** | No refresh delay is needed to produce it. The reducer returns `completed` deterministically from the merged event stream whenever the last assistant event is any agent's `end_turn`. |
| Yesterday's PR (#28) fixed this | **FALSE** | Yesterday's `computeDispatchedAgentIds` filters `agentMap` (which agents show). It does NOT touch the two status reducers. I explicitly deferred this as P2-2. |

## Fundamentals

1. A turn is COMPLETED iff the **main agent** signaled completion (main's `stop_reason === "end_turn"` OR a `turn_duration` system event).
2. A subagent signaling `end_turn` ends that subagent's work, not the turn. Subagent ⊂ Turn, not Subagent ≡ Turn.
3. On the dashboard, main JSONL + sidechain JSONLs are merged chronologically into one `events` array. Any reducer that "finds the last X" across this merged array will cross ownership boundaries unless filtered.
4. `turnSnapshot.ts` has three parallel status derivations: turn status (lines 253, 420), agent status per agent (lines 284, 453), and the newly added `computeDispatchedAgentIds` ownership filter. Yesterday's work added (3) but left (1) untouched.

## Root cause (confirmed from code)

`buildTurn` (full path) and `extendTurn` (streaming path) both run:
```ts
for (let i = events.length - 1; i >= 0; i--) {
  if (events[i].type === "assistant") {           // no isSidechain check
    const asst = events[i] as AssistantEvent;
    if (asst.message?.stop_reason === "end_turn") {
      status = "completed";                       // flips on subagent end_turn
    }
    break;                                        // walks away after wrong event
  }
}
```

Scenario (live): Main emits `tool_use` (Task), subagent runs, subagent emits `end_turn` at T. Between T and main's next event, the stream's last assistant is the subagent. Reducer returns `completed`. `finalizeTurn` force-completes all agents. User sees the "completed" state with a pulsing subagent indicator on the LATEST turn — which, from the user's view, is "always completed" because every subagent completion produces a fresh false-completion.

Scenario (historical): A prior-turn subagent finished late and its last event's timestamp falls inside a later turn's window. Same reducer path, same wrong answer.

## Solution direction — smallest, single-source fix

**Principle**: turn status is decided by main events only. Subagent `end_turn` does not vote.

### Code change (two call sites, ~2-4 lines each)

In both reducer loops in `turnSnapshot.ts`:
```ts
for (let i = events.length - 1; i >= 0; i--) {
  if (events[i].type === "assistant" && !events[i].isSidechain) {  // ← filter
    const asst = events[i] as AssistantEvent;
    if (asst.message?.stop_reason === "end_turn") status = "completed";
    break;
  }
}
```

Same for the `turn_duration` system-event scanner if needed — but `turn_duration` is emitted only for the main turn by the SDK, so it's safe without the filter. Verify with a test; do not add code if unnecessary.

### Tests (regressions that would have caught this months ago)

1. **Last event is subagent end_turn, main last asst is tool_use** → `turn.status === "running"`. This is the exact symptom the user sees.
2. **Main dispatches 3 subagents in parallel, all finish with end_turn, main still waiting** → `turn.status === "running"`. Tests that multiple subagent end_turns don't combine into a false completion.
3. **Main emits its own end_turn AFTER subagents finished** → `turn.status === "completed"`. Tests the happy path still works.
4. **Cross-turn leak**: a subagent's end_turn timestamp falls in turn N+1's window → turn N+1's status is not flipped by it.

### Dev-mode assertion (make the next regression loud)

In the reducer, after setting `status = "completed"`, in `import.meta.env.DEV`, assert the triggering event's `agentId` is main or null (or it's a `turn_duration` system event). If not, `console.warn` with the event UUID. Tiny addition, catches the class of drift at runtime.

## Why this belongs to the "multiple derivations of one fact" pattern

This is the third bug in 48 hours with the same shape:
- **Session 1**: turn status vs agent status diverged because both were derived independently. Fix: `finalizeTurn` syncs them. Added `dispatchedAgentIds` to make membership consistent across paths.
- **Session 2**: timeline bound derived from main only, turn membership derived from timestamp. Fix: convex hull + dispatch-based membership.
- **Session 3 (this one)**: turn status derived without ownership filtering. Fix: filter sidechain out.

Each fix is small. The meta-pattern is not: every "compute X about a turn" site that walks `events` must decide what ownership filter to apply, and the answer is always the same — turn-level derivations use main events only, agent-level derivations use that agent's events only.

The structural next step after this fix is to expose a canonical filter helper (e.g. `mainEventsOnly(events)` and `eventsForAgent(events, agentId)`) and require every reducer in `turnSnapshot.ts` to call one of them. No reducer reads raw `events` without passing it through a filter. That's what makes the next regression impossible rather than merely testable.

## Concrete verification against the user's report

User report: "i always see the last turn state is completed, it's always like that."

Expected after fix:
- During live multi-agent turns, the current turn displays "running" until MAIN's last assistant event has `stop_reason === "end_turn"` OR a `turn_duration` system event arrives. Subagent end_turns do not flip the indicator.
- Historical turns where a prior subagent's end_turn landed in a later turn's timestamp window are unaffected (main's own end_turn at its own timestamp is authoritative).

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md`

Your choice:

- `/mas:bug-fix --auto fix turn-status sidechain bleed per docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md` — narrow fix: add `!isSidechain` guard to both status reducers, add 4 regression tests, 1 dev-mode assertion. Ships in one PR, closes the user-visible symptom. Estimated diff: <20 lines production, ~80 lines tests.

- `/mas:dev-loop unify event-ownership filtering per docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md` — structural fix: introduce `mainEventsOnly`/`eventsForAgent` helpers, require all reducers in `turnSnapshot.ts` to route through them, delete the ad-hoc `event.agentId ?? "main"` patterns. Makes the class extinct. Larger diff.

Recommend: bug-fix now (same-day ship, closes user's visible bug), dev-loop as the permanent cure once you've had a day to review whether we've stabilized enough that the helper abstraction is earned rather than speculative.
