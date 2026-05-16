# Phase 3 Implementation Plan

**Spec:** `docs/specs/phase-3-subagent-join.md` (Step 2 approved with REVISE → fixes applied)
**Status:** ready · **Owner:** main session · **Blocked on:** other agent on repo

---

## Pre-flight

```bash
cd /Users/soh/working/ai/claude-devtools
git status
git diff dashboard/src/lib/turnSnapshot.ts
git diff dashboard/src/lib/agentStatus.ts
git diff server/src/analyzer/dag-builder.ts
git diff dashboard/src/hooks/useAgentLogs.ts
git diff server/src/http/routes/session-routes.ts
```

STOP if concurrent edits exist on any target file.

---

## Tasks (TDD order)

### T1 — Create shared constants module

**File:** `shared/agent-ids.ts` (new) OR if no shared package exists, duplicate into both `dashboard/src/lib/agentIds.ts` and `server/src/lib/agentIds.ts` with identical contents.

```ts
export const SYNTHETIC_AGENT_PREFIX = "synthetic:agent:";

export function isSyntheticAgentId(id: string): boolean {
  return id.startsWith(SYNTHETIC_AGENT_PREFIX);
}

export function syntheticToToolUseId(id: string): string | null {
  if (!isSyntheticAgentId(id)) return null;
  return id.slice(SYNTHETIC_AGENT_PREFIX.length);
}

export function toolUseIdToSyntheticAgent(toolUseId: string): string {
  return `${SYNTHETIC_AGENT_PREFIX}${toolUseId}`;
}
```

Acceptance: imports resolve in both packages.

### T2 — Write failing tests first

**File:** `dashboard/src/lib/agentStatus.synthetic.test.ts` (new)

Fixtures F1-F7 from the spec. Each is one `it()` block with minimal event arrays.

**File:** `dashboard/src/lib/turnSnapshot.synthetic.test.ts` (new)

Tests for `computeDispatchedAgentIds`:
- F4: real subagentMeta match → no synthetic created
- F5: real sidechain event in window → no synthetic created
- F6: mixed scenario → real + synthetic coexist
- New: synthetic-id remains stable across `buildTurn` and `extendTurn` (idempotent)

**File:** `server/src/analyzer/dag-builder.synthetic.test.ts` (new)

- F1, F3, F7 mirrored for the server-side DAG builder
- Asserts synthetic nodes appear in the DAG output

Acceptance: ~12 red tests across 3 files.

### T3 — Implement `findToolResultForId` helper

**File:** `dashboard/src/lib/agentStatus.ts`

Extract from `hasParentToolResultAck` body:

```ts
export function findToolResultForId(
  events: readonly SessionEvent[],
  toolUseId: string,
): { timestamp: string; isError: boolean } | null {
  for (const e of events) {
    if (e.type !== "user") continue;
    if (e.isSidechain) continue; // only main user events carry tool_results
    const content = (e as UserEvent).message.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type !== "tool_result") continue;
      if (c.tool_use_id === toolUseId) {
        return { timestamp: e.timestamp, isError: !!c.is_error };
      }
    }
  }
  return null;
}
```

Refactor `hasParentToolResultAck` to use the new helper (keep behavior identical).

Acceptance: existing tests stay green.

### T4 — Add synthetic short-circuit to `isAgentCompleted`

**File:** `dashboard/src/lib/agentStatus.ts`

At the TOP of `isAgentCompleted` (before line 54):

```ts
import { isSyntheticAgentId, syntheticToToolUseId } from "./agentIds";

export function isAgentCompleted(
  agentId: string,
  events: readonly SessionEvent[],
): boolean {
  if (isSyntheticAgentId(agentId)) {
    const toolUseId = syntheticToToolUseId(agentId);
    if (!toolUseId) return false;
    return findToolResultForId(events, toolUseId) !== null;
  }
  // ... existing logic
}
```

Acceptance: F1, F2, F7 from agentStatus.synthetic.test.ts pass.

### T5 — Add synthetic-id binding to `computeDispatchedAgentIds`

**File:** `dashboard/src/lib/turnSnapshot.ts`

```ts
import { SYNTHETIC_AGENT_PREFIX } from "./agentIds";

// Inside the for (const item of contentArr) loop:
let matched = false;

// path 1 — description match against subagentMeta (existing) — set matched = true if it hits
if (typeof description === "string" && subagentMeta) {
  for (const [agentId, meta] of Object.entries(subagentMeta)) {
    if (meta.description !== description) continue;
    if (result.has(agentId)) continue;
    result.add(agentId);
    matched = true;
    break;
  }
}
if (matched) continue;

// path 2 — temporal proximity (existing) — set matched = true if it hits
for (const candidate of events) {
  // ... existing checks
  result.add(candidate.agentId);
  matched = true;
  break;
}

// path 3 — synthetic fallback (NEW)
if (!matched && item.id) {
  const syntheticId = `${SYNTHETIC_AGENT_PREFIX}${item.id}`;
  if (!result.has(syntheticId)) {
    result.add(syntheticId);
  }
}
```

Acceptance: F4, F5, F6 from turnSnapshot.synthetic.test.ts pass.

### T6 — Add `syntheticAgentDispatch` field to `TurnSnapshot`

**File:** `dashboard/src/lib/turnSnapshot.ts`

Extend interface + populate in `buildTurn` and `extendTurn`:

```ts
interface TurnSnapshot {
  // ... existing fields
  /**
   * Map of synthetic agentId → dispatch metadata.
   * In-memory only; never serialized. Same contract as `dispatchedAgentIds`.
   */
  syntheticAgentDispatch?: Map<string, {
    toolUseId: string;
    description?: string;
    subagentType?: string;
    spawnedAt: string;
  }>;
}
```

Populate in a single pass alongside `computeDispatchedAgentIds` (or right after, walking the same events). Keep memory cost negligible.

Acceptance: idempotent across `extendTurn` (the seed Map merges with new dispatches).

### T7 — Mirror synthetic-id binding in server `dag-builder.ts`

**File:** `server/src/analyzer/dag-builder.ts`

Locate the analyzeEvents pass (around line 171, iterating subagentEvents). Add a parallel walk over main assistant events:

```ts
import { SYNTHETIC_AGENT_PREFIX } from "../lib/agentIds";

// In analyzeEvents:
// (after existing per-agent analysis)
for (const evt of events) {
  if (evt.isSidechain) continue;
  if (evt.type !== "assistant") continue;
  const content = (evt as AssistantEvent).message.content;
  if (!Array.isArray(content)) continue;
  for (const item of content) {
    if (item.type !== "tool_use") continue;
    if (item.name !== "Agent" && item.name !== "Task") continue;
    if (!item.id) continue;

    // Check if a real agentId was bound for this tool_use via existing logic.
    // If not, create a synthetic node.
    const realBoundId = findRealAgentForToolUse(item.id, events); // existing or new helper
    if (realBoundId) continue;

    const syntheticId = `${SYNTHETIC_AGENT_PREFIX}${item.id}`;
    // Add synthetic node to DAG output:
    nodes.push({
      id: syntheticId,
      label: item.input?.description ?? item.input?.subagent_type ?? "subagent",
      parentId: "main",
      status: findToolResultForId(events, item.id) !== null ? "completed" : "running",
      spawnedAt: evt.timestamp,
      endedAt: findToolResultForId(events, item.id)?.timestamp ?? null,
      tokens: null,  // unknown — UI renders "—"
      cost: null,
    });
  }
}
```

`findToolResultForId` either lives in `server/src/lib/...` (duplicate of dashboard helper) or in shared. Pick consistent with existing repo conventions.

Acceptance: server `dag-builder.synthetic.test.ts` tests pass.

### T8 — Short-circuit `useAgentLogs` for synthetic ids

**File:** `dashboard/src/hooks/useAgentLogs.ts`

```ts
import { isSyntheticAgentId } from "../lib/agentIds";

export function useAgentLogs(projectHash: string, sessionId: string, agentId: string) {
  // ... existing setup
  useEffect(() => {
    if (isSyntheticAgentId(agentId)) {
      setLogs({ events: [] });
      return;
    }
    // ... existing fetch
  }, [projectHash, sessionId, agentId]);
}
```

Acceptance: open a synthetic agent in TraceTab → no 500 from server, panel shows empty-state.

### T9 — Server route safety net

**File:** `server/src/http/routes/session-routes.ts:390`

Add at the start of `getAgentEvents` handler:

```ts
if (isSyntheticAgentId(agentId)) {
  return res.json({ events: [] });
}
```

Belt-and-suspenders. Even if a client somehow requests a synthetic id, the server returns gracefully.

### T10 — UI tolerance for empty/unknown synthetic data

**File:** `dashboard/src/components/bottom-panel/TraceTab.tsx` (and downstream)

For a synthetic agent row:
- Token cell: render `—` when `tokens === null`, not `0`
- Cost cell: same
- Duration: if `endedAt === null`, render as "running" + live ticker (Phase 4 polish; Phase 3 just makes it not crash)
- Click handler: select the synthetic agent (sets it as `selectedAgent`); AgentLogs panel shows empty-state

Acceptance: open the screenshot session in dashboard → 22 rows visible in Agent Graph → click any synthetic → no errors.

### T11 — Audit other `agentId` consumers

```bash
grep -rn "agentId" dashboard/src server/src 2>/dev/null | grep -v test | head -40
```

For each consumer that fetches data by id, confirm it tolerates synthetic ids. The audited callsites in the spec table cover the known cases; the grep verifies nothing else surfaces.

### T12 — Typecheck + test + lint

```bash
cd dashboard
npx tsc --noEmit
pnpm -C dashboard test
cd ../server
pnpm test
```

All green.

### T13 — Visual smoke on real session

Open the dashboard at session `23ba0306` (the screenshot session).
- Agent Graph: count nodes. Expect **22** (one per Agent dispatch). Today's count is much lower.
- Turn footer: select a turn with active dispatches → should read "running."
- Click a synthetic row in Agent Graph → AgentLogs panel renders empty-state, no error.

If counts or behavior don't match, gap review.

---

## Risk gates

| Gate | Pass | Fail |
|---|---|---|
| T1 — shared constants | imports resolve both sides | restructure module layout |
| T2 — tests red | ~12 failing tests | revise fixtures |
| T3 — helper extract | existing tests green | refactor incrementally |
| T4 — isAgentCompleted top-branch | F1/F2/F7 pass | check placement |
| T5 — binding path 3 | F4/F5/F6 pass | trace path priority |
| T6 — TurnSnapshot field | idempotent in extendTurn | re-check seed handling |
| T7 — server DAG synthetic | node count matches | check both passes use SAME prefix |
| T8/T9 — consumer audit | no 500 for synthetic | enumerate missed sites |
| T10 — UI tolerance | "—" for tokens, no crash | tighten null handling |
| T11 — grep | known sites only | add to spec audit table |
| T12 — typecheck/test | clean | per error |
| T13 — visual | 22 nodes visible | gap review |

---

## Out of scope (re-confirmed)

- Pulling token totals for synthetic agents (no data source).
- Recursively dispatched subagents-of-subagents.
- Error-state visual (red icon, error pill) — Phase 4.
- Resolving subagent's own JSONL file.

---

## Execution mode

- **Subagent recommended for T7** — server DAG builder is large (~500 LOC). Spawn an `engineer` subagent with the focused task: "add synthetic-id binding to analyzeEvents in dag-builder.ts per phase-3-impl-plan.md T7."
- T1-T6, T8-T13 fit in current context.
- **High coordination risk:** 6 target files, all core. Confirm other agent's branch is merged or rebased before Step 4 execute.
