# CC Parity — Round 3 Implementation Plan (SDK 0.3.143 Replacements)

**Source spec:** `docs/spec/sdk-replaces-guesswork.md`
**Resume tag:** `phase-r2c-complete`
**Created:** 2026-05-16

Closes every confirmed SDK replacement (R-1..R-5) and the bonus
NEW-3..NEW-9 items. Each phase corresponds to one priority bucket from
the spec; tasks within a phase can run in parallel when files don't
overlap.

---

## Phase R3A — R-2: import HOOK_EVENTS from SDK [S, do directly]

### Spec reference
`sdk-replaces-guesswork.md` § R-2.

### Files
- `dashboard/src/components/panels/HookEditor.tsx` (drop hardcoded
  `EVENT_TYPES`, import `HOOK_EVENTS` from
  `@anthropic-ai/claude-agent-sdk`)
- `dashboard/src/components/panels/__tests__/HookEditor.test.tsx`
  (regression: `length === 29` and a previously-missing event renders)
- `server/src/http/sse-event-handler.ts` — also handle `PostCompact`
  attribution analogously to `PreCompact` (extends B4 ring-buffer
  trigger set to `["PreCompact", "PostCompact"]`)

### Steps
1. Replace `const EVENT_TYPES = [...]` with
   `import { HOOK_EVENTS } from "@anthropic-ai/claude-agent-sdk";` and
   alias for the EventType union.
2. Order the visible list by lifecycle group (session/turn → prompt →
   tools → subagent → compact → permissions → tasks → notification →
   stop → workspace) — sort once at module load using a small
   `LIFECYCLE_ORDER` array; events not in the order map appear at end
   alphabetically.
3. Update HookEditor regression test: assert
   `expect(HOOK_EVENTS.length).toBe(29)` and assert PostCompact +
   FileChanged render (proxies for the new 17).
4. In `sse-event-handler.ts` PreCompact ring buffer
   (`pushPreCompactEntry` etc., introduced in B4 commit `890429e`),
   extend the matching hookEvent set:
   `if (hookEvent === "PreCompact" || hookEvent === "PostCompact")`
   push. The SDKCompactBoundaryMessage handler walks the same buffer;
   attribution UX already handles "cancelled" vs success.

### Verify
```bash
node -e 'console.log(require("@anthropic-ai/claude-agent-sdk").HOOK_EVENTS.length)'
# Expected: 29
pnpm -C dashboard vitest run src/components/panels/__tests__/HookEditor.test.tsx
pnpm -C server vitest run src/http/sse-event-handler.test.ts
npx tsc -p dashboard --noEmit && npx tsc -p server --noEmit
```

### Acceptance criteria
- HookEditor renders all 29 event types.
- PostCompact attribution test added; B4 logic still passes.
- Both tsc + both vitest suites green.

### Commit
`feat: import HOOK_EVENTS from SDK + PostCompact attribution (R-2)`

---

## Phase R3B — R-1: parent_tool_use_id replaces temporal heuristic [M, subagent]

### Spec reference
`sdk-replaces-guesswork.md` § R-1.

### Files
- `server/src/types.ts` (extend `AssistantEvent.message` and
  `UserEvent.message` with `parent_tool_use_id?: string | null`,
  `subagent_type?: string`, `task_description?: string`)
- `dashboard/src/lib/types.ts` (mirror)
- `dashboard/src/lib/agentStatus.ts` — `dispatchingToolUseIds` refactor
- `dashboard/src/lib/turnSnapshot.ts` — `computeDispatchedAgentIds`
  refactor
- `dashboard/src/lib/agentStatus.test.ts` + `turnSnapshot.test.ts`
- `server/src/http/sse-event-handler.ts` — forward the new fields if
  the SDK message carries them (already does at top level on
  `SDKAssistantMessage`)

### Steps
1. Extend types on both sides.
2. New helper in `agentStatus.ts`:
   ```ts
   function dispatchersFromStructuredField(
     targetAgentId: string,
     events: readonly SessionEvent[],
   ): Set<string> {
     const result = new Set<string>();
     for (const e of events) {
       if (e.agentId !== targetAgentId) continue;
       if (e.type !== "assistant" && e.type !== "user") continue;
       const ptui = (e as AssistantEvent | UserEvent).message
         ?.parent_tool_use_id;
       if (ptui) result.add(ptui);
     }
     return result;
   }
   ```
3. Refactor `dispatchingToolUseIds`:
   ```ts
   const structured = dispatchersFromStructuredField(targetAgentId, events);
   if (structured.size > 0) return structured;
   // Fall back to existing 5-second temporal window
   ```
4. Same pattern in `turnSnapshot.ts` `computeDispatchedAgentIds`.
5. Tests:
   - Existing temporal tests pass unchanged.
   - 2 new tests: synthetic events with `parent_tool_use_id` set return
     the dispatcher without invoking the temporal scan; mixed-data
     scenario where some events have the field and some don't still
     resolves correctly.
   - 1 stress test: 3 concurrent Task dispatches with JSONL flush
     delayed > 5 s — structured field path attributes correctly;
     temporal path would have mis-attributed.

### Verify
```bash
pnpm -C dashboard vitest run src/lib/agentStatus.test.ts src/lib/turnSnapshot.test.ts
npx tsc -p server --noEmit && npx tsc -p dashboard --noEmit
```

### Acceptance criteria
- New helper exists, used as the primary path.
- Temporal scan still works when `parent_tool_use_id` absent.
- Stress test with > 5 s flush delay attributes correctly when field
  is present.

### Commit
`feat: SDKAssistantMessage.parent_tool_use_id replaces temporal heuristic (R-1)`

---

## Phase R3C — R-3 + R-4: getContextUsage + autoCompactThreshold [L, subagent]

### Spec reference
`sdk-replaces-guesswork.md` § R-3 and § R-4.

### Files
- `server/src/http/routes/session-routes.ts` — new
  `GET /api/sessions/:sessionId/context-usage`
- `server/src/session/session-manager.ts` — expose
  `getContextUsage(sessionId)` returning the SDK response or null
- `dashboard/src/lib/usage-types.ts` — extend with the
  `SDKControlGetContextUsageResponse` shape (or re-export the SDK type
  if importable)
- `dashboard/src/components/bottom-panel/UsageTab.tsx` — prefer the new
  endpoint for live sessions, fall back to existing
  `/api/usage/breakdown` for historical
- `dashboard/src/components/conversation/ContextWarningBanner.tsx` —
  read `autoCompactThreshold` from context (via LayoutContext) when
  available; copy uses the real value
- `dashboard/src/contexts/LayoutContext.ts` — add
  `autoCompactThreshold: number | null` so the banner can read it
  without a new fetch
- Tests for each

### Steps
1. Server: add `getContextUsage(sessionId)` on SessionManager that
   delegates to the underlying `activeQuery.getContextUsage()`.
   Returns null when session not live or query disconnected.
2. New route returns `{ usage: SDKControlGetContextUsageResponse |
   null }`. Handle gracefully when null.
3. Dashboard `UsageTab` selection logic:
   - If session is live (passed via prop or detected via metrics),
     fetch context-usage. On non-null, render rich breakdown (5+ new
     sections: MCP overhead, agents, skills, slash commands, message
     breakdown).
   - Else fall back to current `/api/usage/breakdown` path.
4. Plumb `autoCompactThreshold` from the live SDK fetch into
   LayoutContext alongside the existing OTel result fields (mirrors
   the R2A1 wiring pattern).
5. `ContextWarningBanner` reads from context; copy becomes
   `"Context is X% full — autocompact fires at Y%"` when threshold
   known, current copy when unknown.
6. Tests:
   - Server: stub SessionManager to return a synthetic context-usage
     payload; route returns it. Stub null → 404 path.
   - Dashboard: UsageTab renders rich breakdown when fetch resolves;
     falls back when null/error.
   - ContextWarningBanner: threshold known → real number; unknown →
     existing copy.

### Verify
```bash
pnpm -C server vitest run src/http/routes/session-routes 2>&1 | tail -5
pnpm -C dashboard vitest run src/components/bottom-panel/UsageTab src/components/conversation/ContextWarningBanner 2>&1 | tail -5
npx tsc -p server --noEmit && npx tsc -p dashboard --noEmit
```

### Acceptance criteria
- Live SDK sessions get the rich UsageTab breakdown (≥ 5 new
  sections).
- Historical sessions still work via JSONL aggregator (no regression).
- ContextWarningBanner shows the real autocompact threshold when
  available.

### Commit
`feat: getContextUsage + autoCompactThreshold replace manual aggregation (R-3+R-4)`

---

## Phase R3D — R-5: narrow enum tightening [S, do directly]

### Spec reference
`sdk-replaces-guesswork.md` § R-5.

### Files
- `dashboard/src/lib/streaming-types.ts` — `CompactMetadata.trigger`
  narrow to `'auto' | 'manual'` (matches SDK strict shape) but keep
  `| string` for forward compat? — re-read the spec; spec recommended
  NO escape hatch.
- `server/src/http/sse-event-handler.ts` — `CompactTrigger` union
  narrowed.
- Optionally tighten `status: string | null` for streaming-state
  status fields to `'compacting' | 'requesting' | null` to match
  `SDKStatus`.
- Tests: ensure no regression on existing fixtures that use literal
  `"auto"` / `"manual"`.

### Steps
1. Narrow the unions per spec.
2. Add `import type { SDKStatus, HookEvent } from "@anthropic-ai/claude-agent-sdk"` where useful.
3. Update any tests that previously used a string literal outside the
   union — there shouldn't be any.

### Verify
```bash
npx tsc -p dashboard --noEmit && npx tsc -p server --noEmit
pnpm -C dashboard test && pnpm -C server test
```

### Acceptance criteria
- TypeScript enforces enum membership.
- No test changes needed.

### Commit
`refactor: narrow SDKStatus, session state, compact trigger enums (R-5)`

---

## Phase R3E — NEW-3..NEW-9 bonus items (write specs first, then implement)

Each NEW-* needs a brief spec section in `sdk-replaces-guesswork.md`
before implementation. Recommend extending the existing doc rather
than spawning new files.

### NEW-3 — `query.supportedAgents()` replaces AgentManager scan [S]
- Spec: AgentManager currently reads `.claude/agents/<name>/CLAUDE.md`.
  SDK can list them authoritatively (includes plugin-contributed
  agents we miss).
- Implement: new server route → query method; AgentManager fetches it
  preferentially.

### NEW-4 — `query.mcpServerStatus()` new MCP Status panel [M]
- Spec: 4-state per server (connected / failed / needs-auth /
  pending). New BottomPanel tab or new SettingsPanel section.

### NEW-5 — `query.backgroundTasks(toolUseId?)` "background this" action [S]
- Spec: button on long-running Bash tool calls and subagent dispatch
  rows.

### NEW-6 — `query.stopTask(taskId)` kill button on TasksTab [S]
- Spec: trash icon column per task row; confirms before kill.

### NEW-7 — Structured Task lifecycle messages [M]
- Spec: TasksTab consumes `SDKTaskStartedMessage` / `TaskUpdatedMessage`
  / `TaskProgressMessage` / `TaskNotificationMessage` for live
  sessions; richer status (pending/running/completed/failed/killed/paused).

### NEW-8 — Live hook progress in HooksTab [M]
- Spec: subscribe to `SDKHookStartedMessage` / `HookProgressMessage` /
  `HookResponseMessage`; in-flight hooks render with progress bar.

### NEW-9 — `SDKPermissionDeniedMessage` distinct UI [S]
- Spec: PermissionBlock currently handles approve/deny flow; explicit
  denial messages should render as distinct rows (red badge, reason).

For each NEW-*: spec + implementation plan + execute via subagent
following the same pattern as R-1..R-5.

---

## Execution order + parallelization

```
Cluster 1 (parallel — disjoint files):
  R3A (R-2 HOOK_EVENTS)          ← HookEditor + sse-event-handler
  R3B (R-1 parent_tool_use_id)   ← types + agentStatus + turnSnapshot
  R3D (R-5 enum tightening)      ← streaming-types + sse-event-handler

  NOTE: R3A and R3D both touch sse-event-handler.ts — SERIALIZE these
  (R3A first, then R3D).

After Cluster 1:
  R3C (R-3 + R-4)                ← bigger; depends on stable types

After R3C:
  R3E bonus items (NEW-3..NEW-9) — write specs, then dispatch each
```

After each task: run `Verify` block, commit, tag at phase boundary.

Phase tags:
- `phase-r3a-complete` after R-2
- `phase-r3b-complete` after R-1
- `phase-r3c-complete` after R-3+R-4
- `phase-r3d-complete` after R-5
- `phase-r3e-complete` after NEW-3..NEW-9 batch

---

## Out of scope

- NR-1 bounded compact: confirmed not replaceable in current SDK.
- NR-2 /loop and /goal markers: capture-gated; reverts to Phase D in
  the original plan.
- NR-3 mtime heuristics: stays as fallback (the daemon sidecar from
  R2B is the authoritative replacement, already shipped).
