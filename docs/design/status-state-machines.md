# Status State Machines

**Author:** Luke + Claude
**Date:** 2026-03-29
**Status:** Draft

---

## Session State Machine

```
                    ┌──────────────────────┐
                    │                      │
                    ▼                      │
    ┌───────────────────────────┐          │
    │         CREATED           │          │
    │                           │          │
    │  entry: JSONL file found  │          │
    └─────────────┬─────────────┘          │
                  │                        │
                  │ first event written    │
                  ▼                        │
    ┌───────────────────────────┐          │
    │         ACTIVE            │          │
    │                           │◀─────────┘
    │  file mtime < 2min        │   new event written
    │  UI: green dot, "live"    │
    └─────────────┬─────────────┘
                  │
                  │ no event for 2min
                  ▼
    ┌───────────────────────────┐
    │          IDLE             │
    │                           │
    │  file mtime 2min–12h      │
    │  UI: no indicator         │
    │                           │
    │  on: new event written    │
    │    → transition to ACTIVE │
    └─────────────┬─────────────┘
                  │
                  │ no event for 12h
                  ▼
    ┌───────────────────────────┐
    │         CLOSED            │
    │                           │
    │  file mtime > 12h         │
    │  UI: grey                 │
    │                           │
    │  on: new event written    │
    │    → transition to ACTIVE │
    └───────────────────────────┘
```

**Trigger:** file mtime (polled by session-discovery)

---

## Turn State Machine

```
                  user event
                  (external, with text)
                  │
                  ▼
    ┌───────────────────────────┐
    │        RUNNING            │
    │                           │
    │  entry: turn boundary     │
    │    detected               │
    │                           │
    │  UI: ● pulsing dot        │
    │       elapsed timer       │
    │       "Generating..."     │
    │                           │
    │  while:                   │
    │    assistant events       │
    │    (stop_reason: null,    │
    │     tool_use, end_turn)   │
    │    user events            │
    │    (tool_result)          │
    │    progress events        │
    │    system events          │
    │    (stop_hook_summary)    │
    │                           │
    └──────────┬────────────────┘
               │
               │ system event:
               │   subtype = "turn_duration"
               │
               ▼
    ┌───────────────────────────┐
    │       COMPLETED           │
    │                           │
    │  entry: read durationMs   │
    │    from turn_duration     │
    │    event                  │
    │                           │
    │  UI: ✓ checkmark          │
    │       "Completed in Xs"   │
    │       (durationMs from    │
    │        the event)         │
    │                           │
    │  terminal state           │
    │  (turns never reopen)     │
    └───────────────────────────┘
```

**Single transition.** One signal. No fallbacks. No timeout heuristics.

**Edge case — non-last turns:** When a new turn boundary arrives, the previous turn transitions to COMPLETED regardless of whether it has a `turn_duration` event. The next-boundary detection is a structural guarantee (if a new turn started, the old one is done).

---

## Agent State Machine (within a turn)

```
                  first event with
                  this agentId
                  │
                  ▼
    ┌───────────────────────────┐
    │         ACTIVE            │
    │                           │
    │  entry: agent appears     │
    │    in turn events         │
    │                           │
    │  UI: ● pulsing cyan dot   │
    │       animated edges      │
    │                           │
    │  while:                   │
    │    receiving events       │
    │    (last event < 30s)     │
    │                           │
    └──────┬──────────┬─────────┘
           │          │
           │          │ tool_result
           │          │ with is_error: true
           │          │
           │          ▼
           │  ┌───────────────────────────┐
           │  │         ERROR             │
           │  │                           │
           │  │  UI: ✗ red dot            │
           │  │       "error" label       │
           │  │                           │
           │  │  on: parent turn          │
           │  │    → COMPLETED            │
           │  │    overrides error        │
           │  └───────────────────────────┘
           │
           │ no event for 30s
           │ OR parent turn → COMPLETED
           │
           ▼
    ┌───────────────────────────┐
    │       COMPLETED           │
    │                           │
    │  UI: ✓ green dot          │
    │       solid edges         │
    │                           │
    │  terminal state           │
    └───────────────────────────┘
```

**Key rule:** When the parent turn transitions to COMPLETED, ALL agents in that turn immediately transition to COMPLETED — overriding any current state (including ERROR and ACTIVE).

---

## Combined View — State Hierarchy

```
SESSION ─────────────────────────────────────────────────
  │
  │  contains 1..N turns
  │
  ├── TURN 1 [COMPLETED] ───────────────────────────────
  │     │  completed by: next turn boundary
  │     ├── Agent main    [COMPLETED]
  │     ├── Agent explore [COMPLETED]
  │     └── Agent plan    [COMPLETED]
  │
  ├── TURN 2 [COMPLETED] ───────────────────────────────
  │     │  completed by: next turn boundary
  │     ├── Agent main     [COMPLETED]
  │     └── Agent engineer [COMPLETED]
  │
  └── TURN 3 [RUNNING] ─────────────────────────────────
        │  no turn_duration event yet
        ├── Agent main    [ACTIVE]   (last event 2s ago)
        ├── Agent explore [COMPLETED] (last event 45s ago)
        └── Agent reviewer [ACTIVE]  (last event 8s ago)

        ▼ system/turn_duration arrives ▼

  └── TURN 3 [COMPLETED] ───────────────────────────────
        │  turn_duration.durationMs = 127000
        ├── Agent main     [COMPLETED]  ← forced by turn
        ├── Agent explore  [COMPLETED]
        └── Agent reviewer [COMPLETED]  ← forced by turn
```

---

## Transition Summary

| State Machine | States | Transitions | Signal |
|---------------|--------|-------------|--------|
| Session | CREATED → ACTIVE → IDLE → CLOSED | file mtime thresholds | Polled |
| Turn | RUNNING → COMPLETED | `system subtype=turn_duration` OR next turn boundary | Event-driven |
| Agent | ACTIVE → COMPLETED | Parent turn completes OR 30s inactivity | Inherited + time |
| Agent | ACTIVE → ERROR | `tool_result.is_error` | Event-driven |
| Agent | ERROR → COMPLETED | Parent turn completes | Inherited |

---

## What This Replaces

| Current (heuristic) | Proposed (state machine) |
|---------------------|--------------------------|
| `isLastTurn && !turn.endTime` | `turn.status === "running"` |
| `endTime = last event timestamp` (always set) | `durationMs` from `turn_duration` event |
| `stop_reason === "end_turn"` (94% reliable) | `system/turn_duration` (100% reliable) |
| Agent 30s timeout (independent of turn) | Agent inherits from turn + 30s for running turns only |
| Position-based `isLastTurn` | Status-based `turn.status` |
