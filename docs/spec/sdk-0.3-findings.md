# `@anthropic-ai/claude-agent-sdk` 0.3.143 — guesswork-replacement findings

**Updated:** 2026-05-16 from `0.2.114` → `0.3.143`
**Source of truth:** `server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (5722 lines), `sdk-tools.d.ts` (2848 lines)
**Predecessor:** `docs/spec/cc-parity-gaps-round2.md`

The SDK ships rich typed message + control APIs that **directly replace heuristics we currently rely on**. This document catalogs each replaceable guesswork item with line citations.

---

## High-impact replacements

### G1 — `SDKAssistantMessage.parent_tool_use_id` replaces the 5-second temporal-proximity heuristic

**Current guesswork:** `dashboard/src/lib/agentStatus.ts:140-178` (`dispatchingToolUseIds`)

```ts
// For each main Task/Agent tool_use, find the FIRST sidechain event
// whose agentId isn't already bound, within DISPATCH_WINDOW_MS (5 s)
// of the tool_use. That sidechain's agentId is considered dispatched.
```

5-second window is a guess — concurrent or queued Task dispatches with high-latency JSONL flush can mis-attribute.

**SDK truth:** `sdk.d.ts:2490-2503`
```ts
export declare type SDKAssistantMessage = {
    type: 'assistant';
    message: BetaMessage;
    parent_tool_use_id: string | null;   // ← authoritative dispatcher
    subagent_type?: string;              // ← agent type name (no inference)
    task_description?: string;
    // ...
};
```

**Impact:** Replace the temporal heuristic with a direct field read. Eliminates the false-positive surface around concurrent Task dispatches that `hasParentToolResultAck` currently guards against (`agentStatus.ts:180-200`). Same field appears on `SDKUserMessage` (3229), `SDKPartialAssistantMessage` (3590), `SDKHookStartedMessage` (3608), `SDKToolUseSummaryMessage` (3637).

**Plumbing required:**
1. Extend `AssistantEvent.message` (and `UserEvent`) typed shape in `server/src/types.ts` + `dashboard/src/lib/types.ts` with `parent_tool_use_id?: string | null`, `subagent_type?: string`, `task_description?: string`.
2. JSONL on disk may or may not include them — needs a real-session grep. The SDK message stream definitely does.
3. Refactor `dispatchingToolUseIds` to prefer `parent_tool_use_id` when present, fall back to the temporal window otherwise (backward compat for older sessions).

---

### G3 — Hook event types: 12 → 29 (we're missing 17)

**Current state:** `dashboard/src/components/panels/HookEditor.tsx` lists 12 event types from P0-3.

**SDK truth:** `sdk.d.ts:738`
```ts
export declare const HOOK_EVENTS: readonly [
  "PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch",
  "Notification", "UserPromptSubmit", "UserPromptExpansion",
  "SessionStart", "SessionEnd",
  "Stop", "StopFailure", "SubagentStart", "SubagentStop",
  "PreCompact", "PostCompact",
  "PermissionRequest", "PermissionDenied",
  "Setup", "TeammateIdle",
  "TaskCreated", "TaskCompleted",
  "Elicitation", "ElicitationResult",
  "ConfigChange", "WorktreeCreate", "WorktreeRemove",
  "InstructionsLoaded", "CwdChanged", "FileChanged",
];
```

**Missing in our HookEditor (17):**
PostToolBatch, UserPromptExpansion, SessionEnd, StopFailure, PostCompact, PermissionRequest, PermissionDenied, TeammateIdle, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged.

**Impact:** Import `HOOK_EVENTS` directly from the SDK and use it as the source. Stop hardcoding the list. Future SDK upgrades add hooks automatically. Also B4 PreCompact attribution should be extended to **PostCompact** (newly visible).

---

### G4 — `query.getContextUsage()` returns rich per-category breakdown (deprecates manual aggregation)

**Current guesswork:** `server/src/analyzer/usage-breakdown.ts` aggregates per-model from JSONL `assistant.message.usage`. We chose this because `/api/oauth/usage` only returns utilization percentages.

**SDK truth:** `sdk.d.ts:2152, 2634-2724`
```ts
query.getContextUsage(): Promise<SDKControlGetContextUsageResponse>;

interface SDKControlGetContextUsageResponse {
  categories: { name, tokens, color, isDeferred? }[];     // pre-categorized
  totalTokens; maxTokens; rawMaxTokens; percentage;
  model: string;
  memoryFiles: { path, type, tokens }[];
  mcpTools: { name, serverName, tokens, isLoaded? }[];
  agents: { agentType, source, tokens }[];                 // per-subagent token cost
  slashCommands?: { totalCommands, includedCommands, tokens };
  skills?: { totalSkills, includedSkills, tokens, ... };
  autoCompactThreshold?: number;                           // ← replaces our hardcoded 80%
  isAutoCompactEnabled: boolean;
  messageBreakdown?: {
    toolCallTokens, toolResultTokens, attachmentTokens,
    assistantMessageTokens, userMessageTokens,
    redirectedContextTokens, unattributedTokens,
    toolCallsByType: { name, callTokens, resultTokens }[],
    attachmentsByType: { name, tokens }[],
  };
  apiUsage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } | null;
}
```

**Impact:** UsageTab can render a much richer breakdown — per-MCP-server costs, per-agent costs, slash command + skill overhead, and the **authoritative autoCompactThreshold** instead of our hardcoded 80%. This is only available for live SDK sessions (control request); the JSONL-based aggregator stays as fallback for historical sessions.

**Plumbing:**
- Server adds a route that calls `query.getContextUsage()` when a SessionManager-tracked session is being viewed.
- UsageTab fetches that endpoint preferentially, falls back to `/api/usage/breakdown` (our JSONL aggregator) when not available.

---

### G5 — `autoCompactThreshold` hardcoded as 80%

**Current state:** Was hardcoded in the (now-removed) ContextPressureChart and in `ContextWarningBanner.tsx:43` ("80% full" message).

**SDK truth:** `SDKControlGetContextUsageResponse.autoCompactThreshold?: number` (G4 endpoint above).

**Impact:** Update the warning banner copy to use the real threshold value when available.

---

### G7/G8/G9 — Narrow enums available, we typed open string

**SDK types (narrow):**
- `SDKStatus = 'compacting' | 'requesting' | null` (`sdk.d.ts:3455`)
- `SDKSessionStateChangedMessage.state: 'idle' | 'running' | 'requires_action'` (`sdk.d.ts:3432`)
- `compact_metadata.trigger: 'manual' | 'auto'` (`sdk.d.ts:2525`) — strict; the CHANGELOG-mentioned "reactive"/"rewind" do not exist as enum values; they're conceptual states. Our open string union was defensive; could narrow without losing info.

**Impact:** Tighten the corresponding types in `dashboard/src/lib/streaming-types.ts` and `server/src/http/sse-event-handler.ts`. Mostly hygiene.

---

## Replaceable but lower priority

### G2 — `subagent_type` and `task_description` on assistant messages

Already covered by G1 plumbing. Use directly instead of inferring from tool input.

### G6 — Context window size

`SDKControlGetContextUsageResponse.maxTokens` and `rawMaxTokens` are authoritative per-session. Our `FALLBACK_CONTEXT_WINDOW_SIZES` map is still needed for historical sessions, but live sessions should prefer the SDK value.

---

## NOT replaceable (current heuristic is the best option)

### G10 / FU-1 — `summarizeUpTo` bounded compact

Exhaustive scan of `SDKControlRequestInner` (`sdk.d.ts:2942`) — no `compact_request` or similar control method. The SDK exposes `SDKCompactBoundaryMessage` as an **output** (`preserved_messages.uuids`) but no **input** for caller-bounded compaction. Our current prompt-template approach (`session-manager.ts:498`) stays the best available approach until the SDK adds one.

### P1-3 `/loop` and P1-4 `/goal` markers

Grepped SDK types for `loop`, `goal`, `scheduled`, `wakeup`, `cron` — no dedicated message types. Either the markers ARE conventional user messages or they're not in the public SDK type surface. Capture-gated work item stands.

---

## Bonus capabilities the SDK exposes we don't yet use

| API | What it gives us |
|---|---|
| `query.supportedAgents(): Promise<AgentInfo[]>` (`sdk.d.ts:2139`) | List of all configured subagents — replaces our `AgentManager` filesystem scan in `dashboard/src/components/panels/AgentManager.tsx` |
| `query.supportedCommands(): Promise<SlashCommand[]>` (`sdk.d.ts:2127`) | Already used. Confirmed correct. |
| `query.mcpServerStatus(): Promise<McpServerStatus[]>` (`sdk.d.ts:2146`) | connected / failed / needs-auth / pending per MCP server — feeds a new MCP status panel |
| `query.backgroundTasks(toolUseId?)` (`sdk.d.ts:2269`) | Dashboard "Background this task" button — programmatic Ctrl+B |
| `query.stopTask(taskId)` (`sdk.d.ts:2256`) | Dashboard kill-task button |
| `SDKTaskStartedMessage` / `SDKTaskUpdatedMessage` / `SDKTaskProgressMessage` / `SDKTaskNotificationMessage` (`sdk.d.ts:3503-3580`) | Structured task lifecycle — currently we only render `queued_command` attachments. The actual task system has full state transitions in typed messages |
| `SDKHookStartedMessage` / `SDKHookProgressMessage` / `SDKHookResponseMessage` | Live hook lifecycle on the stream — Hooks tab can show progress for in-flight hooks |
| `SDKPermissionDeniedMessage` (`sdk.d.ts:3175`) | Already we have permission flow; this is an explicit denial message we should render distinctly |
| `SDKPromptSuggestionMessage` | Future use — CC sends prompt suggestions |
| `SDKControlRewindFilesRequest` (`sdk.d.ts:2968`) | Confirms our `/rewind` route shape; nothing to change |

---

## What the SDK does NOT confirm (still gap-worthy)

- The on-disk JSONL's camelCase `compactMetadata` vs the SDK message stream's snake_case `compact_metadata` divergence. SDK only types the stream side. Our P1-5 dual-casing fix is the right call.
- `~/.claude/sessions/<pid>.json` and `~/.claude/tasks/<sessionId>/<id>.json` daemon sidecars are NOT in the SDK type surface — those are CC daemon internals. R2B1+R2B2 work stands.

---

## Recommended next-loop priority

1. **G3** (S) — switch HookEditor to import `HOOK_EVENTS` from the SDK; ship 17 missing event types automatically.
2. **G1+G2** (M) — wire `parent_tool_use_id` / `subagent_type` / `task_description` into our types, prefer over temporal heuristic. Big correctness win on concurrent Task dispatches.
3. **G4+G5** (L) — add `/api/sessions/:id/context-usage` proxying `query.getContextUsage()`; UsageTab uses rich shape for live sessions, falls back to JSONL aggregator for historical.
4. **Bonus: MCP server status panel** (S–M) — surfaces a brand-new control plane.

Each item is independently shippable. None conflict with the deferred capture-gated work (P1-3, P1-4).
