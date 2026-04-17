# Plan: Unify event-ownership filtering in turnSnapshot

**Date:** 2026-04-17
**Branch:** `feature/event-ownership-filters`
**Brainstorm:** `docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md` (structural follow-up option)
**Scope:** Refactor to eliminate the "multiple derivations of one fact" bug class that produced 4 PRs in 14 hours.

## Problem

Across PRs #26–#29, the same bug class appeared 4 times:

- **#27**: `extendTurn` missing `finalizeTurn` — agent vs turn status diverged
- **#28**: `computeTimeline` used main-only bounds; subagent events bled across turn boundaries
- **#29**: turn status flipped when the last assistant in the merged stream was a subagent's `end_turn`

Each was a reducer that walked `events` and made an ownership decision inline, with no shared vocabulary. `buildTurn` has `!event.isSidechain` at line 168 AND line 382. `extendTurn` has the same pattern at 585. `agentMap` uses `event.agentId ?? "main"` at 304 and 511. Every reducer re-invents the filter. When one drifts, a bug ships.

## Goal

Make the ownership filter a first-class named concept. Every reducer in `turnSnapshot.ts` that walks `events` must take its input through one of two named helpers:

- `mainEventsOnly(events)` — only main (non-sidechain) events
- `eventsForAgent(events, agentId)` — only events owned by `agentId` (including `"main"`)

Raw `events` walks for ownership-sensitive derivations are gone.

## Tasks

### TASK-001 — Introduce ownership-filter helpers

**Files:**
- `dashboard/src/lib/turnEventFilters.ts` (NEW)
- `dashboard/src/lib/turnEventFilters.test.ts` (NEW)

**Changes:**

Create `turnEventFilters.ts` with two functions and type-safe implementations:

```ts
import type { SessionEvent } from "./types";

/** Returns only main-thread events (exclude sidechain subagent events). */
export function mainEventsOnly(events: readonly SessionEvent[]): SessionEvent[] {
  return events.filter((e) => !e.isSidechain);
}

/** Returns only events owned by the given agent.
 *  agentId === "main" matches events with no agentId set (undefined or null) AND non-sidechain.
 *  Other agentIds match events with exactly that agentId (sidechain subagent events).
 */
export function eventsForAgent(
  events: readonly SessionEvent[],
  agentId: string,
): SessionEvent[] {
  if (agentId === "main") {
    return events.filter((e) => !e.isSidechain);
  }
  return events.filter((e) => e.agentId === agentId);
}
```

No behavior change yet — just the vocabulary.

**Tests:**

In `turnEventFilters.test.ts`:
- **T-FILTERS-1** `mainEventsOnly excludes sidechain`: stream of 3 main + 2 sidechain events → returns 3 main.
- **T-FILTERS-2** `eventsForAgent("main") returns non-sidechain events`: same input → returns 3 main events.
- **T-FILTERS-3** `eventsForAgent("subA") returns only that agent's sidechain events`: stream with events tagged `agentId: "subA"` and `agentId: "subB"` → returns only subA events.
- **T-FILTERS-4** `eventsForAgent is immutable`: calling twice returns two different arrays but same content (defensive: helpers return new arrays, never mutate input).
- **T-FILTERS-5** `empty array returns empty array` (no-op).

### TASK-002 — Route `turnSnapshot.ts` reducers through the helpers

**Files:**
- `dashboard/src/lib/turnSnapshot.ts`
- `dashboard/src/lib/turnSnapshot.test.ts` (adjust existing tests if fixtures break; do NOT weaken assertions)

**Changes:**

1. **`buildTurn` status derivation (line ~381)**: currently uses `events[i].type === "assistant" && !events[i].isSidechain` backward scan. Replace with a forward scan over `mainEventsOnly(events)` finding the last assistant event:
   ```ts
   const mainEvents = mainEventsOnly(events);
   for (let i = mainEvents.length - 1; i >= 0; i--) {
     if (mainEvents[i].type === "assistant") {
       const asst = mainEvents[i] as AssistantEvent;
       if (asst.message?.stop_reason === "end_turn") status = "completed";
       break;
     }
   }
   ```
   Replace the inline guard with the helper call. Hoist `const mainEvents = mainEventsOnly(events);` once at the top of buildTurn so the same value is reused if needed.

2. **`extendTurn` status derivation (line ~584)**: same refactor. Note that extendTurn operates on `newEvents`, so use `mainEventsOnly(newEvents)`. Hoist once at top of extendTurn.

3. **`computeDispatchedAgentIds` (line ~157 area)**: already filters on `!event.isSidechain` at line 168. Replace with `for (const event of mainEventsOnly(events))`. Inline guard removed.

4. **Agent-level status derivation (line ~284-289 and ~453-460)**: the per-agent status is derived from `info.lastEvent`, which is set during the `agentMap` build loop. Each agent's `lastEvent` is by construction already that agent's event (not cross-agent). This is structurally correct already — no change needed. But add a comment referencing the helper: `// info.lastEvent is already agent-owned by agentMap construction; eventsForAgent(events, agentId) would produce the same last element.` Keep it a comment, not a call — the current code is efficient and correct.

5. **`agentMap` construction (lines ~304, ~511)**: `const agentId = event.agentId ?? "main";`. This bucket-assignment is semantically correct (main events have no agentId; subagent events do). Leave the bucketing logic but route the loop input through... actually, leave this as-is. It's bucketing ALL events, not filtering. The helper doesn't apply here without changing semantics.

6. **Make `TurnSnapshot.dispatchedAgentIds` required**: currently optional (`dispatchedAgentIds?: Set<string>` on the TurnSnapshot interface). All 3 code paths now populate it; remove the `?`. Update the type and any consumers if TypeScript complains. If a consumer treats the field as optional, they will get a compile error — fix at the consumer site by handling the now-required Set.

**No net behavior change** from this refactor. Existing tests must pass unchanged. If any test fails, the refactor introduced a bug; investigate rather than adjust the test.

**New property-style tests to add** to `turnSnapshot.test.ts`:

- **T-OWN-1** `status derivation ignores sidechain regardless of order`: three permutations of a stream — (a) main end_turn followed by sidechain end_turn, (b) sidechain end_turn followed by main end_turn, (c) only sidechain end_turn (no main end_turn). Assert status is completed, completed, running respectively. This is the invariant the helpers enforce.
- **T-OWN-2** `mainEventsOnly is applied in extendTurn too`: same permutations but exercised via `groupEventsIntoTurnsIncremental` with a split midstream. Same verdicts.

### TASK-003 — (Optional, keep in plan but evaluate during execution) Make `dispatchedAgentIds` required

Folds into TASK-002. If TASK-002 engineer reports that making it required would break consumers they can't fix in scope, they should split this off as TASK-003 for a separate engineer dispatch. Otherwise, ship it inside TASK-002.

## File Overlap

| Task | Files |
|------|-------|
| TASK-001 | turnEventFilters.ts (new), turnEventFilters.test.ts (new) |
| TASK-002 | turnSnapshot.ts, turnSnapshot.test.ts |

TASK-002 imports helpers from TASK-001's file. **Sequential dispatch**: TASK-001 must complete first, then TASK-002.

## Verification

```bash
cd dashboard && pnpm test --run
cd dashboard && npx tsc --noEmit
```

- All 1178 existing tests pass unchanged.
- New tests: T-FILTERS-1..5 (TASK-001), T-OWN-1..2 (TASK-002). Target ~1185 total.
- tsc: exactly 4 pre-existing errors (unchanged).

## Out of Scope

- Integration test wiring multi-turn sessions through the full pipeline (P2 from the "open items" brainstorm — separate work).
- Dev-mode warning when temporal-proximity fallback fails to bind (P3 — separate tiny PR).
- Fixing 4 pre-existing tsc errors in unrelated files (P3 — separate tiny PR).
- Server-side refactors.

## Success Criteria

1. `turnSnapshot.ts` has zero occurrences of `!event.isSidechain` or `!events[i].isSidechain` — all replaced with `mainEventsOnly()` calls.
2. `TurnSnapshot.dispatchedAgentIds` is a required field (no `?`).
3. Two new helpers exported from `turnEventFilters.ts` with unit tests.
4. All existing tests pass; new property tests T-OWN-1/2 pass.
5. Any future reducer added to `turnSnapshot.ts` that walks `events` for ownership-sensitive work must import `mainEventsOnly` or `eventsForAgent` — the option to write `!event.isSidechain` inline is eliminated at the readability level (reviewers should reject it in future PRs).
