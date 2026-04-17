# Brainstorm: single source of truth for "completed" status — the CORE refactor

**Date:** 2026-04-17
**Input type:** Question (definition) + demand for root fix
**Input (verbatim):** "tell me what is the definition of completed for each turn and for each agent" + "i want to touch me the core, the fucking core"

**Revision history:**
- v1 (earlier today): proposed `stop_reason === "end_turn"` as THE signal. **Had a blind spot** — subagents can terminate without end_turn (P0 lesson 2026-04-15). Would ship a regression.
- v2 (this version): corrected predicate uses THREE data signals, no timers. Closes the blind spot.
- v3 (this edit): added explicit Ground Truth and Gap sections — the framing that actually explains why this is the root.

## Ground Truth — what the JSONL gives us

The JSONL records agent termination with **THREE different terminal signals**, depending on how the agent finished. This is the ground truth from the Claude Code SDK, not our invention:

| # | Signal | When it appears | Reliability |
|---|--------|-----------------|-------------|
| 1 | `stop_reason === "end_turn"` on the agent's last assistant event | Agent finished normally with a clean end_turn | Authoritative when present |
| 2 | `system` event with `subtype === "turn_duration"` | SDK emits at main-turn boundary | Authoritative for main only |
| 3 | Parent emits a `user` event with `toolUseResult` tied back to the subagent's Task dispatch | Subagent handed output back to parent (the parent literally acknowledges "your work is in" — even when the subagent exited on `stop_reason === "tool_use"` rather than `end_turn`) | Authoritative for subagents |

**Two invariants follow from the SDK contract:**

1. **Transitive**: Task/Agent tool calls block the parent until `tool_result` arrives. Therefore main's `end_turn` implies every descendant has terminated. If main is done, the tree is done.

2. **Self-consistent**: at least one of the three signals is always present for a terminated agent. Subagents that exit on `tool_use` don't emit end_turn — but their parent always emits the tool_result ack (Signal 3). The JSONL never leaves us guessing.

## Gap — what we ignored, what we invented instead

**We read Signal 1 reliably, and we ignored Signals 2 and 3.**

Because we ignored Signal 3 — the parent's `toolUseResult` acknowledgment — we couldn't detect subagents that finished without `end_turn`. Instead of reading the data, we **invented a 30-second stopwatch** (`ACTIVE_THRESHOLD_MS = 30_000` in `dag-builder.ts`) to guess when an agent had "probably finished." Different files guessed with slightly different rules, producing three parallel status state machines (`turnSnapshot.ts` turn status, `turnSnapshot.ts` per-agent status, `dag-builder.ts::analyzeEvents`) that drift against each other.

**Two concrete gaps:**

### Gap 1 — The unused signal
The parent's `toolUseResult` event proves a subagent is done. It's in every JSONL. It's emitted by the SDK itself. We never read it. Instead we built a timer-based guess. That's the direct cause of:
- The "subagent stuck running" pattern (P0 lesson 2026-04-15)
- The "agent flashed completed → active" pattern (P0 lesson 2026-04-12)
- Today's screenshot: turn "Completed in 3m 18s" + `mas:bug-fixer` pill still pulsing

### Gap 2 — The ownership inversion we didn't model
Completion is sometimes proven by the agent itself (Signal 1) and sometimes by its parent (Signal 3). We built code for the first case only. Our mental model was "each agent reports its own completion." The SDK's actual model is "termination can be self-reported OR parent-acknowledged, whichever happens." We need to read the parent's events too, not just the agent's.

**Everything downstream is consequence.** The three state machines, `finalizeTurn`, `adjustStatusForSubagents`, the 30s heuristic, `hasEndTurn` flags, `isSubagent` branches, `isRecent` checks, the ESLint rule we added to ban inline `isSidechain` reads — all of it exists to paper over these two gaps. Close the gaps and the scaffolding goes away.

The gap is not code complexity. It's roughly 50 lines of missing reads in the JSONL.

## The CORE — one sentence

**Completed is a property of an agent. An agent is completed iff the JSONL contains any one of three terminal signals for that agent. Everything else — turn status, UI pills, the graph, pulse animations — derives from that predicate. No stored status fields. No timers. No heuristics.**

## The predicate (the ONLY source of truth)

```ts
/**
 * An agent is COMPLETED iff any of these terminal signals is present:
 *   1. Own `end_turn`:    last assistant event owned by agentId has stop_reason === "end_turn"
 *   2. Main turn end:     system event subtype === "turn_duration" (main only)
 *   3. Parent ack:        parent emitted a user event with toolUseResult for this agent's
 *                          Task dispatch (proves the subagent handed back its output)
 *
 * No timers. No "stale" heuristics. Pure data.
 */
function isAgentCompleted(
  agentId: string,
  events: readonly SessionEvent[],
): boolean {
  // Signal 1: own end_turn
  const owned = eventsForAgent(events, agentId);
  for (let i = owned.length - 1; i >= 0; i--) {
    if (owned[i].type !== "assistant") continue;
    if ((owned[i] as AssistantEvent).message?.stop_reason === "end_turn") return true;
    break; // last assistant event found; don't keep walking
  }

  // Signal 2: main-only turn_duration
  if (agentId === "main") {
    for (const e of events) {
      if (e.type === "system" && (e as SystemEvent).subtype === "turn_duration") {
        return true;
      }
    }
  }

  // Signal 3: parent tool_result acknowledgment (subagents only)
  if (agentId !== "main") {
    const mainEvts = mainEventsOnly(events);
    for (const e of mainEvts) {
      if (e.type !== "user") continue;
      const content = (e as UserEvent).message?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type !== "tool_result") continue;
        // toolUseResult carries the agentId that produced it (or
        // match via tool_use_id → originating Task tool_use → agentId)
        if (matchesAgentDispatch(c, agentId, events)) return true;
      }
    }
  }

  return false;
}
```

Cheap to call — each branch walks backward from the end until it hits the answer or gives up.

## Why this is the CORE and not another surface patch

### The root is in the data contract, not our code

Claude Code's JSONL records completion in multiple ways depending on how a subagent terminates:

| Subagent termination mode | Terminal signal the JSONL provides |
|---|---|
| Subagent emits `end_turn` normally | Signal 1 (own end_turn) |
| Subagent finishes mid-tool-use (e.g. Explore agent hitting limit) | Signal 3 (parent tool_result) — subagent's own stop_reason is `tool_use`, not `end_turn` |
| Main turn ends with explicit duration marker | Signal 2 (turn_duration) |

No single signal covers all three cases. That's the data-level truth we've been working around with timers. **The timer was the wrong abstraction** — time is not a terminal signal in any theoretical sense; it's a guess that eventually the session will not produce more events. That guess is wrong for long-running agents (can take >30s mid-computation) and unnecessary for agents that terminated hours ago (the JSONL is closed — no more events are coming regardless of timer).

### The transitive invariant — from the SDK contract

Task/Agent tool calls are blocking in Claude Code's SDK. Therefore:

```
Main end_turn
  ⇔ all its tool_use calls have tool_results
  ⇒ all direct subagents terminated (any mode: end_turn, tool_result-ack, or error)
  ⇒ all grandchildren terminated (recursive)
```

Testable property: for any event stream where main has end_turn or turn_duration, **every other agentId present in the stream must be `isAgentCompleted === true`.** If this property ever fails, either the predicate is wrong or the JSONL is malformed.

## What gets deleted (and why it's safe)

| Current code | Delete because |
|---|---|
| `TurnSnapshot.status` field | Derive via `isAgentCompleted("main", turnEvents)` on read |
| `AgentSummary.status` field | Derive via `isAgentCompleted(agentId, turnEvents)` on read |
| `TurnSnapshot.dispatchedAgentIds` field | Still needed for membership filtering, KEEP |
| `finalizeTurn` | Invariant holds by construction — no force-sync needed |
| `adjustStatusForSubagents` | Same |
| `dag-builder.ts::analyzeEvents` status branch (+ `isRecent`, `ACTIVE_THRESHOLD_MS = 30_000`, `hasEndTurn`, `isSubagent` logic) | Replace with `isAgentCompleted(agentId, eventsForAgent)` |
| Tests asserting "running after 30s → completed" | Delete. The 30s heuristic is replaced by data-driven checks. Subagents without end_turn are caught by Signal 3. |

## What stays

- `computeDispatchedAgentIds` + `dispatchedAgentIds` field (PR #28, #30, #34) — needed to decide WHICH agents belong to a turn's display, separate concern from completion.
- `mainEventsOnly` / `eventsForAgent` helpers (PR #30) — the canonical event filters, used inside `isAgentCompleted`.
- Hierarchical DAG structure (parent-child edges) — needed to render the tree, separate from completion status.

## Three-state UI (acknowledging data truth)

Current: `running | completed` (false dichotomy).

Proposed: `running | completed | indeterminate`.

- `running` — no terminal signal AND the session is still actively receiving events
- `completed` — any of the three terminal signals present
- `indeterminate` — no terminal signal AND session is closed / JSONL is truncated / data is malformed

This is rare but honest. Better than silently flashing "running" forever or lying "completed" at 30s.

UI pill color:
- `running` = amber pulse
- `completed` = green check
- `indeterminate` = grey question mark (clickable to show diagnostic)

## Property tests — the teeth of this refactor

```ts
describe("isAgentCompleted invariants (SDK contract)", () => {
  it.each(allSessionFixtures)("main completed ⇒ all descendants completed", (events) => {
    if (!isAgentCompleted("main", events)) return; // vacuously true
    const descendants = collectAgentIds(events).filter(id => id !== "main");
    for (const d of descendants) {
      expect(isAgentCompleted(d, events)).toBe(true);
    }
  });

  it("all three signals are recognized", () => {
    // fixture 1: subagent with end_turn → completed via signal 1
    // fixture 2: main with turn_duration, subagent with only tool_use → subagent completed via signal 3
    // fixture 3: main with end_turn, no subagents → main completed via signal 1
  });

  it("running state is stable: no event can un-complete a completed agent", () => {
    // After any terminal signal, adding MORE events doesn't flip back to running.
  });

  it("no timer in the predicate: output is a pure function of events", () => {
    // Call isAgentCompleted(x, events) at t=0 and at t=1_day_later. Same answer.
  });
});
```

That last property is the test the 30s heuristic CAN'T pass. It forces the implementation to be pure.

## Implementation scope

| File | Change |
|---|---|
| `dashboard/src/lib/agentStatus.ts` | **NEW** — exports `isAgentCompleted`, `AgentStatus` type (3-state), and property-test helpers |
| `dashboard/src/lib/agentStatus.test.ts` | **NEW** — unit + property tests |
| `dashboard/src/lib/turnSnapshot.ts` | Remove `status` field from `TurnSnapshot` + `AgentSummary`. Delete `finalizeTurn`, `adjustStatusForSubagents`. Callers derive status via `isAgentCompleted`. |
| `dashboard/src/lib/turnSnapshot.test.ts` | Rewrite tests to check `isAgentCompleted(…, turn.events)` instead of `turn.status`. |
| `server/src/analyzer/dag-builder.ts` | Remove `analyzeEvents` status branch + `isRecent` + `hasEndTurn` + `isSubagent` flag. Use `isAgentCompleted`. Export server-side equivalent (same logic, Node-compatible). |
| `server/src/analyzer/dag-builder.test.ts` | Update tests. |
| `dashboard/src/components/conversation/TurnCard.tsx` | Replace `turn.status === "running"` check with `isAgentCompleted("main", turn.events) === false`. |
| `dashboard/src/components/conversation/AgentPills.tsx` | Same pattern per agent. |
| `dashboard/src/components/bottom-panel/TraceTab.tsx` | Same. |
| `dashboard/src/lib/filterDagForTurn.ts` | Drop the status override (no more stored status to override). |
| `eslint.config.js` | Extend PR #30's rule to ban direct `stop_reason` / `end_turn` reads outside `agentStatus.ts`. |

Diff estimate: ~300 lines removed, ~100 added. Net deletion.

## Timeline & risk

- ~1 day of focused work, 2-3 engineers in parallel (turnSnapshot refactor, dag-builder refactor, UI consumers update).
- Risk: rewriting tests is the bulk. Keeping the 3 new property tests RED until the refactor is done keeps us honest.
- Mitigation: land behind `FEATURE_AGENT_STATUS_V2` env flag for 1 session, flip on if clean.

## What this refactor kills (by construction)

Every bug from today's 9 PRs that was "status derivation inconsistent across surfaces":
- #27 turn completed + agent running divergence → impossible: same predicate
- #28 timeline + turn membership drift → membership separate, status unified
- #29 turn status flipped by subagent end_turn → mainEventsOnly + agent-scoped predicate, no interference
- #30 event-ownership filter class → already landed, extended here
- the screenshot bug (footer completed + pill pulsing) → impossible: both read the same predicate

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-status-single-source-of-truth.md` (v2, corrected).

Suggested next step:
  `/mas:dev-loop implement isAgentCompleted as the single status predicate — touch the core per docs/brainstorms/2026-04-17-status-single-source-of-truth.md`

Alternatives (your choice):
  `/mas:bug-fix fix the specific screenshot bug — narrow surface fix only`
  Or continue refining.

Strong recommendation: dev-loop. This is the actual core refactor. The refactor is one day; the "patch the next instance" pace is infinite.
