# Brainstorm: turn-agent status divergence keeps recurring

**Date:** 2026-04-17
**Input type:** Observation + "why does this keep happening"
**Input (verbatim):** "fix your fucking issue the conversation turn show completed, but i know it's not and in the same time agent status is running. and why the fuck on earth that we have this missistake over and over and over again"

## Assumptions (challenged)

| Assumption | Status | Evidence |
|---|---|---|
| "Turn status" and "agent status" are one thing | FALSE | `turnSnapshot.ts:253-273` (turn) and `:284-289` / `:450-460` (per-agent) are independent derivations from the same events. |
| `end_turn` always arrives | FALSE | P0 lessons 2026-04-12 (main quiet, no end_turn) and 2026-04-15 (subagent ends after tool_use). |
| `turn_duration` and `stop_reason=end_turn` are redundant | FALSE | Turn checks `turn_duration` first then `end_turn`. Agent checks only `end_turn`. They disagree when `turn_duration` arrives but the final assistant stopped on `tool_use`. |
| `finalizeTurn` catches inconsistency | PARTIAL | `finalizeTurn` forces agents→completed for completed turns, but only the full rebuild path calls it. `extendTurn` (streaming fast path) does NOT. |
| Each past bug was independent | FALSE | All recurrences are the same structural bug: multiple derivations of the same fact, patched locally. |

## Fundamentals

1. There is ONE underlying fact — "is this turn still generating" — shown in multiple places (TurnFooter, AgentPills, AgentGraph, TopBar).
2. Source of truth is JSONL + session-active signal. Read-only.
3. Two code paths produce status: full rebuild (`groupEventsIntoTurns`) and streaming extend (`extendTurn`). They must be extensionally equal for the same input. They aren't — finalization exists only in the full-rebuild path.
4. Hierarchy: turn owns agents. Turn completed ⇒ all its agents terminal. Reverse not true.
5. Heuristics are load-bearing (`end_turn` precedence, stale-event 30s, main-vs-subagent rule split) and are currently duplicated across `turnSnapshot.ts` and `dag-builder.ts` with subtle differences.

## Root cause — why this keeps happening

No single function answers "is agent X done?" Three call sites re-derive it with different rules:
- `turnSnapshot.buildTurn` agent status: plain `end_turn` check, no stale heuristic, no main/subagent split, no turn-wins.
- `turnSnapshot.extendTurn` agent status: same simple check, and no `finalizeTurn` call afterward.
- `dag-builder.analyzeEvents` / `determineAgentStatus`: has the `isSubagent` + `isRecent` heuristics (added in the 2026-04-12 and 2026-04-15 fixes).

Plus `TurnCard.tsx:101` adds a session-level override (`sessionIsRunning !== false`) that neither agent path uses.

Every past fix added a conditional to one of the three derivations. Never made them share a derivation.

## Output — solution direction (build up from fundamentals)

1. **Single status reducer.** `deriveStatus(events, sessionIsActive, now) → { turn, agents }`. One file. Every path (buildTurn, extendTurn, dag-builder) calls it. Delete the duplicates.
2. **Type-level invariant** `turn.completed ⇒ all agents terminal`: encode as discriminated union so "completed turn + running agent" is unrepresentable, not just guarded.
3. **Centralize heuristics** (`COMPLETION_TIMEOUT_MS`, `isStaleAgent`, `isMainAgent`) in one file with unit tests.
4. **Property tests over example tests**:
   - `∀ events: turn(events).status === "completed" ⇒ ∀a: a.status !== "running"`
   - `∀ prefix, suffix: extendTurn(buildTurn(prefix), suffix) === buildTurn(prefix ++ suffix)` — this alone would have caught the missing finalization.
5. **Dev-mode invariant assertion** at render boundary: log error if completed-turn-running-agent ever appears, so the next regression fails visibly in dev rather than in a user screenshot.

## Concrete scenario that produces the current bug

1. Session has a `turn_duration` system event for turn T.
2. Main agent's last assistant event in turn T has `stop_reason === "tool_use"` (not `end_turn`).
3. New events arrive via WS → streaming path calls `extendTurn`.
4. `extendTurn` sets turn.status = "completed" (turn_duration match).
5. `extendTurn` sets main agent.status = "running" (no end_turn on lastAsst).
6. `adjustStatusForSubagents` only reverts turn for NON-MAIN running agents, so turn stays "completed".
7. `finalizeTurn` is never called on this path.
8. Render: TurnFooter shows "Completed ✓", AgentPills shows running dot. User screams.

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-turn-agent-status-divergence.md`

Your choice:

- `/mas:bug-fix fix the completed-turn / running-agent divergence per docs/brainstorms/2026-04-17-turn-agent-status-divergence.md` — narrow fix: make `extendTurn` call `finalizeTurn` when turn flips to completed; make main-agent status respect `turn_duration`. Ships the user-visible fix in one PR.
- `/mas:dev-loop unify status derivation per docs/brainstorms/2026-04-17-turn-agent-status-divergence.md` — structural fix: single reducer + property tests + invariant assertion. Ships the "stop recurring" fix. Larger diff.

Recommend BOTH in order: bug-fix first to stop the bleeding, dev-loop second so this doesn't come back in May.
