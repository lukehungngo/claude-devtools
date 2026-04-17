# Plan: `isAgentCompleted` as the single status predicate — touch the core

**Date:** 2026-04-17
**Branch:** `feature/agent-status-predicate`
**Brainstorm:** `docs/brainstorms/2026-04-17-status-single-source-of-truth.md`
**Scope:** The core refactor. Replace three parallel status derivations with one pure predicate. Remove stored status fields, `finalizeTurn`, `adjustStatusForSubagents`, and the 30s `isRecent` heuristic. Net deletion.

## Ground truth + gap (summary)

The JSONL records agent termination with THREE terminal signals:
1. `stop_reason === "end_turn"` on agent's last assistant event
2. `system` event `subtype === "turn_duration"` (main only)
3. Parent emits `user` event with `toolUseResult` tied to subagent's Task dispatch

We only read Signal 1. Invented a 30s stopwatch to guess when Signal 1 was missing. Three derivations in three files drifted. Close the gap by reading all three signals.

## Task decomposition

### TASK-001 — Predicate + 3-state type (dashboard)

**Files:**
- `dashboard/src/lib/agentStatus.ts` (NEW)
- `dashboard/src/lib/agentStatus.test.ts` (NEW)

**Content:**
- Type: `type AgentStatus = "running" | "completed" | "indeterminate"`
- Function: `isAgentCompleted(agentId: string, events: readonly SessionEvent[]): boolean`
- Function: `getAgentStatus(agentId: string, events: readonly SessionEvent[], sessionIsActive: boolean): AgentStatus`
- Internals use `mainEventsOnly` and `eventsForAgent` from `turnEventFilters.ts` (PR #30)
- Three signals checked in order:
  1. Last owned assistant event has `stop_reason === "end_turn"`
  2. If `agentId === "main"`, any `system` event with `subtype === "turn_duration"`
  3. If `agentId !== "main"`, parent's `user` events contain a `tool_result` matching this agent's originating Task dispatch
- NO timer-based logic. Pure function of events.

**For Signal 3 — matching a subagent to its parent's tool_result:**
- The main's `Task`/`Agent` tool_use events have an `id` (tool_use_id).
- When main receives the subagent's output, it emits a `user` event with `content: [{ type: "tool_result", tool_use_id: X, ... }]`.
- The link from subagent to tool_use_id: `subagentMeta[agentId].description` usually matches the dispatch description, but a more reliable link is via `parentUuid` chains or the first event of the subagent referencing the dispatch. Investigate how to resolve this reliably. If uncertain, fallback: any `tool_result` whose `toolUseResult.agent_type` or similar metadata identifies this agent counts.
- If clean matching isn't possible, use a weaker but correct signal: "if ANY tool_result exists in main's events timestamped after this subagent's last event, the subagent is acknowledged."

**Tests:**
- Unit: each signal in isolation returns true.
- Unit: no signal returns false.
- Property: `∀ events: isAgentCompleted("main", events) ⇒ ∀ agentId ∈ events: isAgentCompleted(agentId, events)` (transitive invariant from SDK contract).
- Property: pure function — calling at t=0 and t=1_day_later with same events returns same answer (no timer dependency).
- Edge: subagent that exits on `tool_use` (not `end_turn`) but has parent tool_result → completed.
- Edge: subagent with no terminal signal at all → running.

### TASK-002 — Predicate (server port)

**Files:**
- `server/src/analyzer/agentStatus.ts` (NEW) — same logic, server types
- `server/src/analyzer/agentStatus.test.ts` (NEW)

**Why port instead of share:** server and dashboard don't share code directly; the type imports differ. 50 lines duplicated is acceptable; both sides unit-tested ensures parity.

Identical logic to TASK-001. Use server's `SessionEvent` type from `server/src/types.ts`.

### TASK-003 — Refactor `turnSnapshot.ts`

**Files:**
- `dashboard/src/lib/turnSnapshot.ts`
- `dashboard/src/lib/turnSnapshot.test.ts`

**Remove:**
- `status: "running" | "completed"` field from `TurnSnapshot` interface
- `status: "running" | "completed" | "error"` field from `AgentSummary` interface
- `finalizeTurn` function
- `adjustStatusForSubagents` function
- The "Re-derive status from new events" block in `extendTurn`
- The backward-scan loops for `stop_reason === "end_turn"` in `buildTurn` and `extendTurn`
- The per-agent status derivation in both `buildTurn` (lines ~284-289) and `extendTurn` (lines ~453-460)

**Keep:**
- `TurnSnapshot.events` field (already present) — consumers will run `isAgentCompleted` on this.
- `TurnSnapshot.agents` — still needed for membership + token/cost aggregation, but without `status`.
- `dispatchedAgentIds` field (PR #28/#30/#34) — orthogonal, keep.
- Turn-boundary detection, event grouping, token accounting — all unchanged.

**Interface change:** `TurnSnapshot.status` is removed. Consumers must call `isAgentCompleted("main", turn.events)`. Similarly for `agent.status`. This is a breaking change to internal API; update all call sites in TASK-005.

**Tests:**
- Update existing tests: remove assertions on `turn.status` and `agent.status`. Replace with assertions that call `isAgentCompleted("main", turn.events)` and equivalent.
- Keep fixtures; just change what's asserted about them.
- Delete tests that specifically exercise `finalizeTurn` or `adjustStatusForSubagents` (those functions are gone).
- Keep the property tests T-OWN-1 and T-OWN-2 from PR #30 (ownership filtering is orthogonal and still needed).

### TASK-004 — Refactor `dag-builder.ts`

**Files:**
- `server/src/analyzer/dag-builder.ts`
- `server/src/analyzer/dag-builder.test.ts`

**Remove from `analyzeEvents`:**
- `status: "active" | "completed" | "error"` return field
- `ACTIVE_THRESHOLD_MS = 30_000` constant
- `hasEndTurn`, `isRecent`, `isSubagent` flag-juggling
- The complex `status` ternary at the end

**Keep:**
- Token aggregation
- Tool call counting (`toolCalls`, `mcpToolCalls`)
- Error detection (`hasRecentError` → emit an `errorStatus: "error" | null` if needed; don't conflate with completion)
- Agent descriptions for edge detection
- Model detection

**New status logic:** `buildAgentDAG` now calls `isAgentCompleted(agentId, allEvents)` when populating the node, where `allEvents` is the merged event stream. Error is separate from completion; an agent can be "completed with errors."

**AgentNode.status semantics:** change to match new AgentStatus type (running/completed/indeterminate/error). Update `AgentNode` interface in `server/src/types.ts` if needed.

**Tests:**
- Update existing dag-builder tests to use the new predicate.
- Delete tests asserting the 30s heuristic specifically.
- Property test: status field on every DAG node matches `isAgentCompleted(node.id, allEvents)`.

### TASK-005 — UI consumers + filterDagForTurn + ESLint

**Files:**
- `dashboard/src/components/conversation/TurnCard.tsx` (status read from predicate, not turn.status)
- `dashboard/src/components/conversation/AgentPills.tsx` (status read from predicate per agent)
- `dashboard/src/components/bottom-panel/TraceTab.tsx` (DAG node status → derived)
- `dashboard/src/components/AgentFlowDAG.tsx` (same)
- `dashboard/src/lib/filterDagForTurn.ts` (remove the status override — stored status no longer exists)
- `dashboard/src/lib/filterDagForTurn.test.ts` (update tests)
- `eslint.config.js` (extend the no-restricted-syntax rule)

**New ESLint rule:** ban direct reads of `stop_reason === "end_turn"` outside `dashboard/src/lib/agentStatus.ts` and `server/src/analyzer/agentStatus.ts`. The selector matches binary expressions comparing `.stop_reason` against `"end_turn"`.

**Three-state indeterminate handling:** for now, treat `indeterminate` identically to `running` visually (pulsing amber). Ship the type + predicate; don't add a new UI for the grey question mark in this PR. Follow-up separate PR.

Rationale: minimize UI diff, focus on the core refactor. The predicate correctly returns `indeterminate` in the rare cases (truncated JSONL, etc.) so the semantic is available; we just don't expose it visually yet.

**Tests:**
- Update component tests to match the new prop/derivation pattern.
- Ensure `filterDagForTurn` tests still cover memoization and envelope computation (PR #32 logic stays).

## File overlap / batching

| Batch | Tasks | Rationale |
|-------|-------|-----------|
| A | TASK-001 + TASK-002 | Pure additions, separate packages, no overlap |
| B | TASK-003 + TASK-004 | Different packages, no file overlap |
| C | TASK-005 | Consumes A's dashboard predicate + B's refactored turnSnapshot/dag-builder |

Sequential between batches. Within each batch, tasks can run in parallel.

MAX_PARALLEL=3 (opus). 2 tasks per batch max → within limit.

TASKS_PER_REVIEWER=5 (opus). One reviewer can cover all 5 tasks' reviews; cross-task review still needed because this refactor spans multiple files with interdependencies.

CROSS_TASK_REVIEW: yes (5 tasks > 3).

## Verification

After all batches complete:
```bash
cd dashboard && pnpm test --run && npx tsc --noEmit
cd ../server && pnpm test --run && npx tsc --noEmit
cd ../dashboard && npx eslint src/lib/turnSnapshot.ts src/lib/agentStatus.ts
```

Expected:
- Dashboard: ~1195 tests pass (1189 baseline + ~10 new, minus a few deleted finalizeTurn tests)
- Server: ~502 tests pass (496 baseline + ~10 new, minus a few deleted heuristic tests)
- tsc: 4 pre-existing dashboard errors only; server clean
- ESLint: clean on target files

**Manual smoke test:**
- Load session `b5d4dcdd-...` (the screenshot session).
- Verify: conversation turn footer "Completed" matches all agent pills (no more pulsing amber when turn is completed).
- Verify: Agent Graph shows same status as conversation turn for every agent.

## Out of Scope

- Feature flag (`FEATURE_AGENT_STATUS_V2`). Ship directly; trust property tests.
- Three-state UI (grey question mark for indeterminate). Predicate returns the state; UI shows as `running` for now. Separate small PR.
- Follow-up P2s from #34 (SessionCache sidebar count, metricsCache key). Unrelated.
- Server-side DAG merging across projectHashes beyond what #34 shipped.

## Why this touches the core (one paragraph)

Until today, every status rendering path read from a different derivation with different rules. `turnSnapshot.ts` had two (turn status + per-agent status). `dag-builder.ts` had a third with a 30s stopwatch. The ESLint rule from PR #30 stopped the SURFACE of inline `!isSidechain` reads but didn't stop the deeper duplication. This refactor makes `isAgentCompleted(agentId, events)` the single predicate read by every surface. The 30s stopwatch is replaced by reading Signal 3 (parent's tool_result acknowledgment), which is data, not time. The transitive SDK invariant (main end_turn ⇒ all descendants done) is testable as a property. Every bug class from today's 9 PRs that was "status derivation inconsistent across surfaces" becomes impossible by construction.
