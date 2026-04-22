# Brainstorm: Turn / Agent Graph / Agent Log synthesis — data must flow from one ground truth

**Date:** 2026-04-19
**Input type:** Observation + Root-cause demand
**Sessions:** 55b3a130-ab2b-4d00-b6e7-a2bb524b2b9b, c8863acc-2bd8-47bd-8876-b859bb009b41
**Input:** "why some turn show running but it's already done, some turn done but it's still running. Agent Log always shows correct data. Why Agent Log still printing data but Turn and Agent Graph show it's completed."

---

## Prior art (do NOT ignore)

Two directly relevant brainstorms from 2026-04-17 were written but partially or fully unimplemented:
- `docs/brainstorms/2026-04-17-turn-agent-status-divergence.md` — identified `extendTurn` missing `finalizeTurn` call
- `docs/brainstorms/2026-04-17-status-single-source-of-truth.md` — proposed `isAgentCompleted()` with three signals, no timers

The current code in `agentStatus.ts` appears to have implemented the three-signal predicate (`getAgentStatus`) but the **sessionIsActive flag path** still has holes, and the **Agent Graph still shows no subagents in live sessions** (7 agents in header, only "Main session" in graph). This is a new regression or a gap the earlier analysis missed.

---

## Assumptions (challenged)

| Assumption | Status | Evidence |
|---|---|---|
| All three components (Turn, Graph, Log) read from the same event array | **QUESTIONED** | Agent Log calls `eventsToLogEntries(events)` directly. TurnHistoryPanel slices `allEvents` per turn. AgentGraph is server-computed DAG sent as `SessionMetrics`. Three separate derivation paths. |
| `sessionIsActive` is authoritative | **FALSE** | `TurnHistoryPanel.tsx:228` — `sessionIsActive = sessionIsRunning !== false` — defaults to `true` when undefined. Server fallback is 12-hour mtime window, not SDK event. |
| `isAgentCompleted` is called consistently across all surfaces | **QUESTIONED** | Agent Graph uses server-computed `dag-builder.ts` which calls `getAgentStatus`. TurnHistoryPanel calls it client-side with a different `sessionIsActive` value. They can disagree on the same session. |
| Agent Log is "also wrong sometimes" | **FALSE** | Agent Log never computes status. It transforms raw events into log entries without ever checking completion. This is why it's always correct. |
| Turn "completed" means all subagents completed | **QUESTIONED** | The transitive invariant (Task calls block parent → main end_turn implies all subagents done) should hold per SDK contract. But the Agent Graph not showing subagents in live sessions (screenshots: 7 agents in header, only "Main session" in graph) suggests the DAG-to-turn binding is broken. |

---

## Fundamentals

### What actually is "Agent Log correct" telling us?

Agent Log is correct because it does **nothing** except project raw events into display format:
```
JSONL events → eventsToLogEntries() → display
```
No status field. No session liveness flag. No heuristics. Just the events.

**This is the ground truth contract**: whatever the JSONL says is what happened.

### Why Turn and Agent Graph diverge from it

Both Turn and Agent Graph must answer "is this still running?" — Agent Log never has to.

To answer that, they need:
1. The terminal signals in the JSONL (own `end_turn`, `turn_duration`, parent `tool_result` ack)
2. The session liveness flag (is more data coming?)

The **terminal signals** are now implemented in `getAgentStatus` (three-signal predicate).

The **session liveness flag** is still broken:
- Server: `isRunning = mtime > (now - 12h)` — wrong for sessions closed 2h ago
- Client: `sessionIsActive = sessionIsRunning !== false` — defaults to `true` when undefined
- Result: turns that completed 6h ago still show as "running" in the sidebar

### The new symptom: Agent Graph missing subagents

Screenshots show 7 agents in the header but Agent Graph only shows "Main session". This is independent of the status bug — it's a DAG construction / turn-filtering bug:

- `filterDagForTurn()` filters the server-computed DAG to only show agents belonging to the selected turn
- If the turn-to-agent binding is broken (dispatch window miss, temporal mismatch), subagents are filtered out
- Agent Graph shows nothing but Main
- This is NOT a status computation bug — it's a membership bug

### The "Agent Log active but Turn says completed" symptom

**Root cause**: main agent sends `end_turn` → three-signal predicate says "completed" → Turn and Graph show completed. But subagents may still be streaming events into the JSONL. Agent Log sees those events.

Wait — per SDK contract (Task calls block parent), main `end_turn` should imply subagents done. If Agent Log is still showing events AFTER main's `end_turn`, one of:
1. The events are subagent events that arrived **before** end_turn but the client is displaying them out of chronological order
2. The session has **multiple concurrent turns** (parallel subagents from different turns overlapping in the JSONL)
3. The streaming delta (WS events) includes events from a **different turn context** than the one being viewed

The most likely: **multi-turn JSONL interleaving**. Session c8863acc has 27 turns. Turns T26 and T27 overlap in time. Events from T27's subagents arrive in the JSONL mixed with T26's end marker. Agent Log shows all events for all agents. The Turn filter for T26 correctly says "completed." But Agent Log continues printing T27 subagent events that are temporally proximate. The user sees "Agent Log printing → T26 says completed" and interprets it as a bug, but they're looking at different turns' data.

---

## Root Causes (ranked)

### RC1 (P0) — Session liveness flag is wrong
`sessionIsActive` defaults to `true`. Server falls back to mtime ±12h. A session that ended 3h ago still shows all its turns as "running" (green dot) in the sidebar.

**Files:** `server/src/parser/session-discovery.ts` (mtime heuristic), `dashboard/src/components/TurnHistoryPanel.tsx:228`

**Fix:** Parse the JSONL for a `session_closed` system event or use the `stop_reason` of the last assistant event in the file as the liveness signal. Never default to `true`.

### RC2 (P1) — DAG-to-turn binding loses subagents in live sessions
`filterDagForTurn()` uses `turn.dispatchedAgentIds` to determine which agents belong to the turn. If the temporal dispatch window (5s) or description match fails for live sessions (events arrive in batches), agents aren't bound and are filtered out of Agent Graph.

**Files:** `dashboard/src/lib/filterDagForTurn.ts`, `dashboard/src/lib/turnSnapshot.ts` (dispatch binding)

**Fix:** For the active (latest) turn, show ALL unbound agents in Agent Graph. An agent that appeared after turn start and has no prior binding belongs to the current turn by default.

### RC3 (P1) — `extendTurn` streaming path still missing finalization
From 2026-04-17 brainstorm (still unconfirmed as fixed): `extendTurn` adds events but may not call `finalizeTurn` when turn flips to completed. Agents can remain "running" in the TurnSnapshot after the turn is marked "completed".

**Files:** `dashboard/src/lib/turnSnapshot.ts` — `extendTurn`

**Fix:** After any `extendTurn` call that results in `turn.status = "completed"`, call `finalizeTurn`.

### RC4 (P2) — Different `sessionIsActive` values at server vs client
Server computes `isAgentCompleted` with its `isRunning` value. Client recomputes it with `sessionIsRunning !== false`. They can disagree because they're evaluating the same predicate with different liveness inputs. When they disagree, Turn status (client) ≠ Agent Graph status (server).

**Fix:** Compute completion status ONCE — on the server, included in `SessionMetrics.agents[agentId].completed: boolean`. Client never re-derives. This is the synthesis-at-source approach the user is asking for.

---

## Solution Direction: Synthesize Once, Distribute

The user's core ask: "I want u to synthesis the data and give it to all other components correctly."

The correct architecture:
```
JSONL (ground truth)
  └─ Server: computeMetrics()
       ├─ session.isActive (authoritative, from last JSONL event)
       ├─ agents[id].completed (three-signal predicate, once)
       ├─ agents[id].events (slice of events for this agent)
       └─ turns[n].agentIds (membership, NOT status)

Dashboard:
  ├─ Agent Graph: reads agents[id].completed from SessionMetrics ← no re-derivation
  ├─ TurnHistoryPanel: reads turns[n].allDone = every agent in agentIds is .completed ← no re-derivation
  └─ Agent Log: reads raw events ← already correct, change nothing
```

**No client-side status re-derivation.** The server is the single synthesis point. It reads JSONL once, computes all derived fields, sends them to the client. Client renders, never recomputes status.

This eliminates the `sessionIsActive` mismatch — server has one value, client trusts it.

---

## What to build

### Phase 1 — Fix session liveness (RC1, fast) ~2h

In `session-discovery.ts` / `computeMetrics()`:
- Scan the JSONL for a `system` event with `subtype === "session_closed"` (if Claude Code emits it)
- Fallback: if the last assistant event's `stop_reason === "end_turn"` or `turn_duration` event present, session is not running
- Never default `isRunning` to `true` just because file is recent; require an explicit active signal (WS connection still open, SSE stream active, or file modified < 30s ago)

In `TurnHistoryPanel.tsx`:
- Remove `sessionIsRunning !== false` default. If `sessionIsRunning` is undefined, treat as `false` (safe default = completed)

### Phase 2 — Move status to server, distribute (RC4) ~4h

In `SessionMetrics`:
```ts
agents: Record<string, {
  completed: boolean; // computed once, authoritative
  error: boolean;
  durationMs: number;
  // ...existing fields
}>
```

Remove client-side `getAgentStatus` calls in `TurnHistoryPanel`, `TurnCard`, `AgentPills`. Read `metrics.agents[id].completed` instead.

### Phase 3 — Fix DAG binding for live turns (RC2) ~3h

In `filterDagForTurn`:
```ts
// If this is the active (last) turn, include all agents not yet bound to a prior turn
if (isActiveTurn) {
  return dag.nodes.filter(n => !boundInPriorTurns.has(n.id));
}
```

### Phase 4 — Verify extendTurn finalization (RC3) ~1h

Audit `extendTurn` to ensure `finalizeTurn` is called whenever turn flips to `completed`.
Add a unit test:
```ts
it("extendTurn: completed turn forces all agents to completed", () => { ... })
```

---

## Next Steps

Saved to `docs/brainstorms/2026-04-19-turn-graph-log-synthesis.md`

Suggested next step:
  `/mas:bug-fix fix session liveness + server-side status synthesis per docs/brainstorms/2026-04-19-turn-graph-log-synthesis.md`

Alternatives:
  `/mas:dev-loop implement full synthesis architecture (Phases 1–4) per docs/brainstorms/2026-04-19-turn-graph-log-synthesis.md`
  Continue refining this analysis.
