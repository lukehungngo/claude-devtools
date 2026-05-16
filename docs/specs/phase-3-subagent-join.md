# Phase 3 Spec — Subagent execution join via tool_result

**Loop step:** 1 of 5 · **Status:** drafting · **Owner:** main session
**Source:** `docs/bugs/subagent-execution-missed.md`

---

## Goal

Make every `Agent` tool dispatch appear in the Agent Graph and turn-completion logic, regardless of whether the subagent emitted any events of its own. Detect "running" vs "completed" via the matching `user.tool_result.tool_use_id`.

User-visible target:
- Turn footer flips from "Completed in Xm" → "Running" when any dispatched Agent lacks a `tool_result`.
- Agent Graph renders **N** nodes for N dispatches (today: only those with own events show up).

---

## Verified ground truth

- `Agent` tool dispatches: **478** across 21 sessions.
- Sidechain assistant events: **0/199,301**. Subagents do not emit own events in this Claude Code variant.
- Existing infra (`agentStatus.ts:140-186`) already does `tool_use_id` → `tool_result` matching when an `agentId` can be bound. **The bind step is what's missing for sidechain-free agents.**
- For session `23ba0306`: 22 Agent dispatches, 22/22 had matching `tool_result` by `tool_use_id`.
- `computeDispatchedAgentIds` (turnSnapshot.ts:183-241) attempts two binds:
  1. `subagentMeta` description match (only populated for SDK-dispatched sessions)
  2. Temporal-proximity to a non-main event with an `agentId` (fails when no such event exists)

When both fail, the dispatch is **invisible** to the DAG.

---

## Strategy: synthetic agentIds bound to tool_use.id

Add a third binding path: when no real `agentId` can be discovered for an `Agent` tool_use, **synthesize** one from the dispatching tool_use's id. The synthetic id is deterministic, never collides with a real agent (which uses UUIDs), and lets downstream code key off it consistently.

### Naming

`synthetic:agent:<tool_use.id>` — easily filterable, debuggable, future-proof if other tool dispatch types appear.

### Downstream effects

- `dispatchedAgentIds` always contains an entry for every Agent dispatch.
- Agent Graph creates one node per synthetic agentId. The node's display name = `Agent.input.description ?? Agent.input.subagent_type ?? "subagent"`.
- `hasParentToolResultAck` already does `tool_use_id` matching; for synthetic ids we can short-circuit (we know the dispatching tool_use.id by construction).
- `eventsForAgent(events, syntheticId)` returns `[]` — the agent has no own events. Consumers must tolerate empty event lists for status display and graph rendering.

---

## Scope

### 3.1 — Add synthetic-id binding in `computeDispatchedAgentIds`

**File:** `dashboard/src/lib/turnSnapshot.ts`

In the `for (const item of contentArr)` loop (line 200), after the description match and temporal-proximity fallback both miss, add:

```ts
// 3. Synthetic-id fallback: subagent has no events of its own (Claude Code variant
//    that doesn't emit sidechain). Bind a synthetic agentId derived from the
//    dispatching tool_use.id so the DAG still represents the dispatch.
if (!matched && item.id) {
  const syntheticId = `${SYNTHETIC_AGENT_PREFIX}${item.id}`;
  if (!result.has(syntheticId)) {
    result.add(syntheticId);
    matched = true;
  }
}
```

**`matched` flag (from review C4):** declare `let matched = false` at the top of the per-item loop body (before path 1). Set `matched = true` after `result.add(candidate.agentId)` in path 2 (line 234). Path 3 only fires when both prior paths failed.

### 3.2 — Carry synthetic-id ↔ tool_use.id mapping

Expose a `syntheticAgentDispatch` map on the `TurnSnapshot` so downstream code can resolve `syntheticId` → `tool_use.id` without re-walking events:

```ts
// in TurnSnapshot
syntheticAgentDispatch?: Map<string, {
  toolUseId: string;
  description?: string;
  subagentType?: string;
  spawnedAt: string;  // ISO timestamp
}>;
```

Populated during `buildTurn` / `extendTurn`. Memory cost negligible (small map per turn).

**Serialization note (from review C5):** `TurnSnapshot` is dashboard-in-memory only — never `JSON.stringify`'d to WS/REST clients. Precedent: existing `dispatchedAgentIds: Set<string>` field is also non-JSON-safe. Map field follows same lifetime contract: derive on read, never persist.

### 3.3 — Tool-result ack for synthetic agents (status)

**File:** `dashboard/src/lib/agentStatus.ts`

**Placement (from review C3):** the synthetic short-circuit MUST go at the **top** of `isAgentCompleted` (before line 54). The current flow calls `eventsForAgent(events, agentId)` first; for synthetic ids that returns `[]`, and `hasParentToolResultAck` then bails at `owned.length === 0`. Result: synthetic always "not completed."

```ts
export function isAgentCompleted(
  agentId: string,
  events: readonly SessionEvent[],
): boolean {
  // INSERT AT TOP — before any owned-events lookup.
  if (isSyntheticAgentId(agentId)) {
    const toolUseId = syntheticToToolUseId(agentId);
    if (!toolUseId) return false;
    return findToolResultForId(events, toolUseId) !== null;
  }
  // ... existing logic
}
```

`findToolResultForId` walks `user` events looking for a `tool_result` block with matching `tool_use_id`. Already half-implemented inside `hasParentToolResultAck`; extract into a helper.

**Error edge (from review C6):** if `tool_result.is_error === true`, the synthetic agent is **completed-with-error**. Phase 3 returns `true` from `isAgentCompleted` (terminal state reached). No recovery semantics — Phase 4 visual rebuild will render the error pill.

For the running session case (no tool_result yet, session active): `isAgentCompleted` returns false → `getAgentStatus` returns "running" — correct.

### 3.4 — Turn completion: require all synthetic agents acked

**File:** `dashboard/src/lib/turnSnapshot.ts` and consumers of `TurnSnapshot`.

Per the architecture, status is **derived on read** via `isAgentCompleted("main", turnEvents)` etc. — there's no stored status field. So Phase 3 doesn't add new state; it ensures:

- `dispatchedAgentIds` includes every dispatched `Agent` (real or synthetic).
- Whoever displays "turn completed" (e.g., `TurnCard.tsx` footer) must check `isAgentCompleted` for all dispatched agent ids — including synthetics — not just `"main"`.

**Audit step:** grep for `isAgentCompleted("main"` and confirm every consumer either:
- Only cares about main's state (e.g., the activity dot), OR
- Wraps the check to AND over all dispatched ids (e.g., the turn footer).

### 3.5 — DAG / Agent Graph renders synthetic nodes

**Architectural decision (from review C2):** the server's `dag-builder.ts` (line 171, iterates `subagentEvents: Map<string, SessionEvent[]>`) has no path to discover synthetic agents from zero-event data. Per architecture invariant #4 ("metrics computed server-side"), the right fix is **option (a): duplicate the synthetic-id binding into `dag-builder.ts`'s analyzeEvents pass.**

Rejected alternatives:
- **(b) Dashboard overlays synthetic nodes post-fetch** — violates invariant #4 (would compute node identities client-side), creates two diverging node-id namespaces.
- **(c) Server consumes a `dispatchedAgentIds` hint** — turns DAG building into a multi-pass dance with a flaky client-supplied hint. Same correctness risk as (b).

**Server-side fix:** `analyzeEvents` (in `dag-builder.ts`) walks main assistant events for `Agent`/`Task` tool_use entries and binds synthetic ids the same way as the dashboard. Both paths must use the **identical** `SYNTHETIC_AGENT_PREFIX` constant — extract it to a shared module (`shared/agent-ids.ts` or whatever convention this repo uses for cross-package constants).

The DAG node:
- **id:** synthetic agentId (`synthetic:agent:<tool_use.id>`)
- **Display name:** `Agent.input.description ?? Agent.input.subagent_type ?? "subagent"`
- **Status:** derived via `isAgentCompleted` (running/completed). Server may also need a synthetic-aware status helper if it derives status independently.
- **Edges:** parent = main. Phase 3 only handles main-dispatched.
- **Token totals:** unknown → emit `null`/`undefined`, not `0`. UI renders "—".
- **Duration:** `spawnedAt = dispatch timestamp`. `endedAt = tool_result timestamp` if present; else `undefined` (running).

### 3.6 — TraceTab row for each synthetic agent

**File:** `dashboard/src/components/bottom-panel/TraceTab.tsx`

If the DAG includes synthetic agents (post-3.5), TraceTab renders them automatically. Verify:
- Row shows dispatch description + status pill
- Token / cost cells display "—" not "0" (zero is misleading)
- Timeline bar: dispatch ts → result ts (or open-ended for running)

---

## API contract

New module-public symbol in `agentStatus.ts`:

```ts
export function findToolResultForId(
  events: readonly SessionEvent[],
  toolUseId: string,
): { timestamp: string; isError: boolean } | null;
```

New field on `TurnSnapshot`:

```ts
interface TurnSnapshot {
  // ... existing fields
  syntheticAgentDispatch?: Map<string, {
    toolUseId: string;
    description?: string;
    subagentType?: string;
    spawnedAt: string;
  }>;
}
```

New utility:

```ts
export const SYNTHETIC_AGENT_PREFIX = "synthetic:agent:";
export function isSyntheticAgentId(id: string): boolean;
export function syntheticToToolUseId(id: string): string | null;
```

---

## Acceptance criteria

### Test fixtures

1. **F1 — Single dispatch + result, both in same turn:** main dispatches Agent(id=t1, description="foo"). User event with tool_result(tool_use_id=t1). → Synthetic agent appears in dispatched set; `isAgentCompleted("synthetic:agent:t1", events)` = true; getAgentStatus = "completed".

2. **F2 — Dispatch without result (live session):** same as F1 but no tool_result yet, session active. → getAgentStatus = "running"; turn-level "completed?" check returns false.

3. **F3 — Multiple parallel dispatches, partial completion:** 3 Agent dispatches, only 2 have tool_results. → DAG has 3 synthetic nodes; turn completion check returns false.

4. **F4 — Subagent description matches subagentMeta:** existing path (1) still wins — no synthetic id created. Preserves SDK-dispatched session behavior.

5. **F5 — Real sidechain events exist for the subagent:** existing temporal-proximity (path 2) still wins — no synthetic id. Preserves multi-variant Claude Code support.

6. **F6 — Mixed: 2 dispatches, one real-bound, one synthetic:** DAG has 2 nodes, one real, one synthetic. Each gets correct status.

7. **F7 — Error result:** tool_result has `is_error: true`. → Synthetic agent is "completed" with error indicator (Phase 3 doesn't surface this UX, but the data path must not crash).

### Existing test suites

- `turnSnapshot.test.ts` all pass.
- `agentStatus.test.ts` all pass.
- `dag-builder.perf.test.ts` and `dag-builder.bench.ts` may need fixture updates if they assume zero synthetic agents.

### Visual smoke

- Open the screenshot session (`23ba0306` or equivalent) in the dashboard.
- Agent Graph shows **22 nodes** (not 3-5 like before).
- Turn footer reflects "running" while any subagent is in-flight, "completed" after all results arrive.

---

## Out of scope (Phase 3)

- Pulling actual token totals for synthetic agents (no data source). Display "—".
- Recursively rendering subagents-of-subagents (we only have signal from main, not sub).
- Error-state visualization (red icon, error pill) — Phase 4 visual rebuild.
- Resolving the subagent's actual JSONL file (separate investigation if Anthropic exposes it).

---

### 3.7 — Audit `agentId` consumers + short-circuit synthetic ids (from review C1)

Enumerated consumers that take `agentId` and would break for synthetic:

| Consumer | File | Fix |
|---|---|---|
| `useAgentLogs(projectHash, sessionId, agentId)` | `dashboard/src/hooks/useAgentLogs.ts:16` | Short-circuit when `isSyntheticAgentId(agentId)` → return `{ events: [] }` without fetching. |
| Server route `getAgentEvents(session, agentId)` | `server/src/http/routes/session-routes.ts:390` | Add: if agentId starts with synthetic prefix, return `{ events: [] }` instead of looking up storage. |
| `LayoutContext.setCurrentSelectedAgent` | `dashboard/src/contexts/LayoutContext.ts` | Allow synthetic ids; AgentLogs panel renders an "no logs available" empty state for synthetic. |
| Any future URL state (`?agent=…`) | TBD | Synthetic prefix makes ids deterministic — survives URL round-trip safely. |

**Required audit step before Step 4 execute:** grep `agentId` in all `dashboard/src/**/*.{ts,tsx}` and `server/src/**/*.ts`. Any consumer that fetches/derives data from an agent id must handle synthetic explicitly (either short-circuit with empty result or accept it as a first-class id).

## Risks

- **Other Claude Code variants:** if a future variant emits BOTH sidechain events AND tool_results, paths 1+2 win first — synthetic stays unused. Safe.
- **Other Claude Code variants:** if a future variant emits BOTH sidechain events AND tool_results, paths 1+2 win first — synthetic stays unused. Safe.
- **Test fixture compatibility:** `dag-builder.perf.test.ts` builds 100+ dispatches; if the test asserts a specific node count, it'll need update.
- **Other agent on repo:** all four target files (`turnSnapshot.ts`, `agentStatus.ts`, `dag-builder.ts`, `TraceTab.tsx`) are core. High conflict surface. Rebase carefully.

---

## Loop status

- [x] Step 1: Spec drafted
- [x] Step 2: Spec review — **REVISE issued, 6 concerns applied:**
  - C1: synthetic-id leak — enumerated consumers (useAgentLogs, server route, LayoutContext) with explicit fix per call site
  - C2: server vs dashboard DAG architectural split — picked option (a), dual synthetic-id binding with shared constant
  - C3: `isAgentCompleted` synthetic branch must be at TOP, before `eventsForAgent` lookup
  - C4: `matched` flag clarified — declare at top of per-item loop, set in path 2 too
  - C5: Map serialization non-issue (TurnSnapshot is dashboard-in-memory only)
  - C6: tool_result.is_error → completed-with-error, no recovery semantics in Phase 3
- [x] Step 3: Implementation plan → `docs/plans/phase-3-impl-plan.md` (T1-T13)
- [ ] Step 4: Execute (blocked: other agent on repo)
- [ ] Step 5: Gap review
