# Pipeline Audit: SDK Assumptions vs Official Implementation

**Date:** 2026-04-01
**Scope:** All guesswork, heuristics, and undocumented assumptions in server/ and dashboard/

---

## Executive Summary

This audit cross-references every assumption in our codebase against the official
`@anthropic-ai/claude-agent-sdk` types (`sdk.d.ts`) and Claude Code source
(https://github.com/anthropics/claude-code).

**Findings:** 14 guesswork items identified. 4 CRITICAL, 5 HIGH, 5 MEDIUM.

---

## 1. JSONL Event Format

### What we assume

`server/src/parser/jsonl-reader.ts:15,56` — Events are cast with `as SessionEvent`. No runtime validation.

`server/src/types.ts` — We define 5 event types: `user`, `assistant`, `system`, `progress`, `queue-operation`.

### What the SDK actually has

The on-disk JSONL contains **at least 12 distinct event types**:

| type | On-disk? | In SDK stream? | We handle? |
|------|----------|----------------|------------|
| `user` | Yes | Yes | Yes |
| `assistant` | Yes | Yes | Yes |
| `system` (various subtypes) | Yes | Yes | Partial |
| `progress` | Yes | Yes | Yes |
| `queue-operation` | Yes | No | Yes |
| `file-history-snapshot` | Yes | No | **NO** |
| `last-prompt` | Yes | No | **NO** |
| `pr-link` | Yes | No | **NO** |
| `tool_progress` | No | Yes | Via SSE |
| `rate_limit_event` | No | Yes | Via SSE |
| `prompt_suggestion` | No | Yes | Via SSE |
| `tool_use_summary` | No | Yes | Via SSE |

**CRITICAL finding:** `file-history-snapshot`, `last-prompt`, and `pr-link` events exist in JSONL but we silently skip them. These inflate our event counts and could confuse parsers expecting only known types.

### Common fields (official, from on-disk JSONL)

Every `user`/`assistant` message has:
- `parentUuid: string | null` — conversation chain (NOT `parent_tool_use_id`)
- `uuid: string`
- `isSidechain: boolean`
- `timestamp: string`
- `sessionId: string`
- `type: string`
- `cwd: string`
- `entrypoint: "cli" | "sdk"`
- `userType: "external"`
- `version: string` — Claude Code version
- `gitBranch: string`
- `slug: string` (optional) — human-readable session ID

**HIGH finding:** We don't use `parentUuid` for conversation chain building. Instead we use linear event order + `isTurnBoundary()` heuristics. The SDK uses `parentUuid` for message threading, which is the canonical approach.

### Severity: CRITICAL

**Action:** Add a known-type filter in the parser. Log unknown event types. Consider using `parentUuid` for conversation threading instead of linear order heuristics.

---

## 2. System Event Subtypes

### What we handle

`server/src/http/sse-event-handler.ts:261-303`:
`status`, `compact_boundary`, `init`, `task_started`, `task_progress`, `task_notification`, `hook_started`, `hook_progress`, `hook_response`

`docs/spec/event-model.md` also documents: `turn_duration`, `custom-title`

### What actually exists (from sdk.d.ts + on-disk)

**SDK stream subtypes:**
`init`, `compact_boundary`, `status`, `api_retry`, `local_command_output`, `hook_started`, `hook_progress`, `hook_response`, `task_started`, `task_progress`, `task_notification`, `session_state_changed`, `files_persisted`, `elicitation_complete`

**On-disk-only subtypes:**
`turn_duration`, `stop_hook_summary`, `api_error`, `bridge_status`, `informational`, `local_command`

### Missing from our handling

| Subtype | Source | Impact |
|---------|--------|--------|
| `session_state_changed` | SDK stream | **HIGH** — carries `idle`/`running`/`requires_action` state |
| `api_retry` | SDK stream | LOW — retry info |
| `files_persisted` | SDK stream | LOW — file checkpoint |
| `elicitation_complete` | SDK stream | MEDIUM — MCP elicitation |
| `stop_hook_summary` | On-disk | LOW — hook summary at stop |
| `api_error` | On-disk | MEDIUM — API errors |
| `bridge_status` | On-disk | LOW — auth status |

### Severity: HIGH

**Action:** `session_state_changed` is the **official way to detect running vs idle**. This replaces our mtime-based `isRunning` heuristic entirely. Must implement.

---

## 3. Session Status Detection

### What we do (guesswork)

`server/src/cache/session-cache.ts:16-17`:
```typescript
const ACTIVE_THRESHOLD_MS = 12 * 60 * 60 * 1000;  // 12 hours
const RUNNING_THRESHOLD_MS = 2 * 60 * 1000;         // 2 minutes
// isRunning = mtime < 2 min
```

`dashboard/src/lib/turnSnapshot.ts:229-252`:
- Check for `system:turn_duration` event
- Check for `stop_reason === "end_turn"` on last assistant
- Default to `"running"`

`dashboard/src/components/conversation/TurnCard.tsx:89`:
- `isStreaming = turn.status === "running" && sessionIsRunning !== false`

### What the SDK provides (official)

**`SDKSessionStateChangedMessage`** — streamed via SDK:
```typescript
{
  type: "system",
  subtype: "session_state_changed",
  state: "idle" | "running" | "requires_action"
}
```

**`SDKResultSuccess`** — terminal message from `query()`:
```typescript
{
  type: "result",
  subtype: "success",
  duration_ms: number,
  total_cost_usd: number,
  num_turns: number,
  stop_reason: "end_turn" | "max_tokens" | "refusal" | null
}
```

**`SDKResultError`** — terminal error:
```typescript
{
  type: "result",
  subtype: "error_during_execution" | "error_max_turns" | "error_max_budget_usd" | "error_max_structured_output_retries"
}
```

### What should change

| Current approach | Official approach | Priority |
|-----------------|-------------------|----------|
| mtime < 2min = running | `session_state_changed.state === "running"` for SSE sessions | CRITICAL |
| mtime < 12hr = active | Keep as fallback for JSONL-only sessions | OK |
| `stop_reason === "end_turn"` = completed | Correct, but also check `result` message | HIGH |
| Default "running" for last turn | Check `last-prompt` event or `result` message in JSONL | HIGH |

### Severity: CRITICAL

**Action:** For SSE sessions, use `session_state_changed` events. For JSONL sessions, check for `result` events (they may not be written to disk — verify). Keep mtime as last-resort fallback only.

---

## 4. Turn Boundary Detection

### What we do (heuristic)

`dashboard/src/lib/turnSnapshot.ts:120-139`:
```typescript
function isTurnBoundary(event): boolean {
  if (event.type !== "user") return false;
  if (event.isSidechain) return false;
  if (event.userType !== "external") return false;
  if (event.isMeta) return false;
  // ... string-based heuristics for system-injected text
  return true;
}
```

### What the SDK actually uses

Turn boundaries are marked by:
1. **`system:turn_duration`** events — definitive end-of-turn in JSONL
2. **`parentUuid` chains** — each turn starts with a user message whose `parentUuid` points to the previous assistant message
3. **Tool results**: user messages with `toolUseResult` field are NOT turn boundaries — they're tool results

**Key field we're not checking:** `toolUseResult` on user events. A user event with `toolUseResult` is a tool result, not a human prompt. We currently check `userType !== "external"` but this may not be reliable.

### What should change

| Current heuristic | Better approach |
|-------------------|----------------|
| String matching for `<task-notification>`, `<local-command-*>` | Check `isMeta` field + `toolUseResult` presence |
| `userType !== "external"` for filtering | `toolUseResult` field presence is definitive |
| Linear event order | Use `parentUuid` chain for threading |

### Severity: HIGH

**Action:** Check `toolUseResult` field on user events. Use `system:turn_duration` as the definitive turn boundary marker. Fall back to heuristics only when those markers are absent.

---

## 5. Agent/Subagent Detection

### What we do

`server/src/analyzer/dag-builder.ts:72-75`:
```typescript
if (content.name === "Agent") {
  const desc = (content.input as Record<string, unknown>).description as string;
}
```

### What the SDK says

The agent tool was **renamed from `"Task"` to `"Agent"` in v2.1.63**. The `init` event's tools list may still show `"Task"`. Code should check for both.

Subagent files: `<session-dir>/<session-id>/subagents/agent-<agentId>.jsonl`
Metadata: `agent-<agentId>.meta.json` with `{ agentType, description }`

SDK events for agent lifecycle:
- `task_started` — `{ taskId, description }`
- `task_progress` — `{ taskId, usage: { total_tokens, tool_uses, duration_ms } }`
- `task_notification` — `{ taskId, status: "completed"|"failed"|"stopped", result?, usage }`

### Severity: HIGH

**Action:** Check for both `"Agent"` and `"Task"` tool names. Use `task_started`/`task_notification` events for agent lifecycle tracking instead of just description matching.

---

## 6. Cost/Token Calculation

### What we hardcode

`server/src/analyzer/metrics.ts:16-24`:
```typescript
const MODEL_PRICING = {
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};
```

### What the SDK provides

**`SDKResultSuccess`** includes:
```typescript
{
  total_cost_usd: number,        // Authoritative session cost
  modelUsage: Record<string, {
    inputTokens: number,
    outputTokens: number,
    cacheReadInputTokens: number,
    cacheCreationInputTokens: number,
    costUSD: number,              // Per-model cost (authoritative!)
    contextWindow: number,
    maxOutputTokens: number,
  }>
}
```

**Per-message** `assistant.message.usage` includes:
```json
{
  "input_tokens": 3,
  "cache_creation_input_tokens": 44926,
  "cache_read_input_tokens": 0,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 44926
  },
  "output_tokens": 23,
  "service_tier": "standard"
}
```

### What should change

| Current approach | Official approach | Priority |
|-----------------|-------------------|----------|
| Hardcoded MODEL_PRICING | Use `result.modelUsage[model].costUSD` | CRITICAL |
| Manual cost = tokens * rate | SDK provides `total_cost_usd` and per-model `costUSD` | CRITICAL |
| Hardcoded context window sizes | `modelUsage[model].contextWindow` | MEDIUM |
| Ignore `cache_creation.ephemeral_*` | SDK tracks these separately | LOW |
| 3 models in pricing table | SDK handles any model | HIGH |

### Severity: CRITICAL

**Action:** For SSE sessions, use `result.total_cost_usd` and `result.modelUsage`. For JSONL sessions, sum per-message costs from `message.usage` but use SDK pricing as source of truth when available. Remove hardcoded MODEL_PRICING as primary source.

---

## 7. Permission Handling

### What we do

`server/src/session/session-manager.ts:166-175`:
```typescript
canUseTool: async (toolName, input, options) => {
  return this.handlePermission(session, toolName, input, { ... });
}
```

### What the SDK expects (official)

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;           // We DON'T use this
    suggestions?: PermissionUpdate[];
    blockedPath?: string;          // We DON'T pass this through
    decisionReason?: string;       // We DON'T pass this through
    title?: string;
    displayName?: string;
    description?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;
```

Return type (official):
```typescript
type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[]; }
  | { behavior: 'deny'; message: string; interrupt?: boolean; };
```

Permission modes: `'default'` | `'acceptEdits'` | `'bypassPermissions'` | `'plan'` | `'dontAsk'`

### Missing from our implementation

| Feature | Status |
|---------|--------|
| `signal: AbortSignal` | Not wired to our timeout |
| `blockedPath` | Not forwarded to dashboard |
| `decisionReason` | Not forwarded to dashboard |
| `updatedInput` on allow | Not supported |
| `updatedPermissions` on allow | Not supported |
| `interrupt` on deny | Not supported |

### Severity: MEDIUM

**Action:** Wire `signal` to abort controller. Forward `blockedPath` and `decisionReason`. Support `updatedInput` for allow responses.

---

## 8. SDK Message Types We Don't Handle

### Stream-only types (never on disk, only via SSE)

From `sdk.d.ts` — `SDKMessage` union has 22+ types:

| Type | We handle? | Impact of missing |
|------|-----------|-------------------|
| `SDKAssistantMessage` | Yes | - |
| `SDKUserMessage` | Yes | - |
| `SDKResultSuccess` | Partial (via SSE) | Missing `modelUsage`, `total_cost_usd` |
| `SDKResultError` | Partial | Missing error subtypes |
| `SDKSystemMessage` (init) | Yes | - |
| `SDKStatusMessage` | Yes | - |
| `SDKCompactBoundaryMessage` | Yes | - |
| `SDKTaskStartedMessage` | Yes | - |
| `SDKTaskProgressMessage` | Yes | - |
| `SDKTaskNotificationMessage` | Yes | - |
| `SDKHookStartedMessage` | Yes | - |
| `SDKHookProgressMessage` | Yes | - |
| `SDKHookResponseMessage` | Yes | - |
| `SDKSessionStateChangedMessage` | **NO** | Missing official running state |
| `SDKToolProgressMessage` | Via SSE | - |
| `SDKRateLimitMessage` | **NO** | Missing rate limit info |
| `SDKPromptSuggestionMessage` | Via SSE | - |
| `SDKToolUseSummaryMessage` | Via SSE | - |
| `SDKAuthStatusMessage` | **NO** | Missing auth status |
| `SDKAPIRetryMessage` | **NO** | Missing retry info |
| `SDKFilesPersistedEvent` | **NO** | Missing file checkpoint info |
| `SDKElicitationCompleteMessage` | **NO** | Missing MCP elicitation |
| `SDKLocalCommandOutputMessage` | **NO** | Missing slash command output |

### Severity: HIGH (for session_state_changed), LOW-MEDIUM for others

---

## 9. `result` Message — Authoritative End Signal

### What we do

We never check for `result` type messages. Our turn/session completion relies on `turn_duration` system events and `stop_reason` heuristics.

### What the SDK provides

The `result` message is the **terminal message** from `query()`. It provides:

```typescript
// Success
{
  type: "result",
  subtype: "success",
  result: string,
  duration_ms: number,
  duration_api_ms: number,
  total_cost_usd: number,
  num_turns: number,
  stop_reason: "end_turn" | "max_tokens" | "refusal" | null,
  usage: NonNullableUsage,
  modelUsage: Record<string, ModelUsage>,
  session_id: string
}

// Error variants
{
  type: "result",
  subtype: "error_during_execution" | "error_max_turns" | "error_max_budget_usd" | "error_max_structured_output_retries"
}
```

**Note:** The `result` message is emitted by the SDK stream but may NOT be written to the on-disk JSONL. Need to verify.

### Severity: CRITICAL

**Action:** Handle `result` messages in SSE event handler. Use `total_cost_usd` and `modelUsage` as authoritative cost data. Use as definitive session-complete signal.

---

## 10. Hook Events (Complete Official List)

### What we know

Our hook handling covers: `hook_started`, `hook_progress`, `hook_response`.

### Official HOOK_EVENTS const (from sdk.d.ts)

```
PreToolUse, PostToolUse, PostToolUseFailure, Notification,
UserPromptSubmit, SessionStart, SessionEnd, Stop, StopFailure,
SubagentStart, SubagentStop, PreCompact, PostCompact,
PermissionRequest, PermissionDenied, Setup, TeammateIdle,
TaskCreated, TaskCompleted, Elicitation, ElicitationResult,
ConfigChange, WorktreeCreate, WorktreeRemove,
InstructionsLoaded, CwdChanged, FileChanged
```

### Severity: LOW

These are hook event names, not message types. Our handling of the 3 hook message types is sufficient.

---

## Priority Action Items

### P0 — Replace guesswork with official SDK data

1. ~~**Handle `session_state_changed`** events — replace mtime-based `isRunning`~~ **DONE** (2026-04-01): Server forwards `session_state_changed` SSE events; dashboard `useStreamingState` tracks `sessionState`; `ConversationView` prefers SDK signal over mtime heuristic with fallback.
2. ~~**Handle `result` messages** — use `total_cost_usd`, `modelUsage` as authoritative~~ **DONE** (2026-04-01): Server forwards `modelUsage` on `SSEResultEvent`; dashboard sets `sessionState = "idle"` on `result` event.
3. ~~**Add `"Task"` as alias for `"Agent"`** tool name in dag-builder~~ **DONE** (2026-04-01): `dag-builder.ts` line 72 checks both `"Agent"` and `"Task"`.
4. ~~**Check `toolUseResult` field** on user events for turn boundary detection~~ **DONE** (2026-04-02): Added `toolUseResult` guard in `turnSnapshot.ts:isTurnBoundary()` as defense-in-depth alongside existing `userType !== "external"` check.

### P1 — Remove hardcoded data in favor of SDK-provided

5. **Replace hardcoded MODEL_PRICING** with `result.modelUsage[model].costUSD` — SDK `modelUsage.costUSD` is now forwarded via SSE `result` event. Dashboard can use it for SSE sessions; hardcoded pricing remains as fallback for JSONL-only sessions.
6. **Replace hardcoded context window sizes** with `modelUsage.contextWindow` — SDK `modelUsage.contextWindow` is now forwarded. Same fallback approach as #5.
7. ~~**Filter unknown JSONL event types** (file-history-snapshot, last-prompt, pr-link)~~ **DONE** (2026-04-02): Added `KNOWN_EVENT_TYPES` set in `jsonl-reader.ts` — unknown types silently skipped in both `parseJsonlFile()` and `parseJsonlIncremental()`.

### P2 — Robustness improvements

8. **Add Zod validation** for JSONL event parsing — deferred (low risk: fail-safe parsing already skips malformed lines)
9. ~~**Forward missing permission fields** (signal, blockedPath, decisionReason)~~ **DONE** (2026-04-02): Added `blockedPath` and `decisionReason` to `PermissionRequest` type, forwarded from SDK `canUseTool` callback through `session-manager.ts` → `permission-handler.ts` → REST API → dashboard.
10. **Use `parentUuid`** for conversation threading (longer-term refactor)

### P3 — Nice to have

11. Handle `SDKRateLimitMessage` for rate limit visibility
12. Handle `SDKAuthStatusMessage` for auth status
13. Handle `SDKAPIRetryMessage` for retry visibility
14. Persist permission allowances to disk

---

## Bug Fixes (discovered during implementation)

### BUG-1: Streaming response text invisible during web-sent prompts

**Severity: HIGH**

`useStreamingState.ts` had no handler for `"stdout"` SSE events. The assistant's text response was invisible during SSE streaming — only thinking blocks and tool calls were visible. Text only appeared after the turn completed and events were refreshed.

**Fixed** (2026-04-02): Added `responseText: string` to `StreamingState`, `stdout` handler in `useStreamingState`, and response text rendering via `ResponseBlock` in `StreamingTurnArea`.

### BUG-2: StreamingTurnArea lacked turn card structure

**Severity: MEDIUM**

The streaming area rendered thinking/tools without the Claude avatar/"Claude" label wrapper that regular TurnCards have, creating visual inconsistency.

**Fixed** (2026-04-02): Wrapped `StreamingTurnArea` content in avatar + label structure matching `TurnCard` layout, added "Working..." streaming indicator.
