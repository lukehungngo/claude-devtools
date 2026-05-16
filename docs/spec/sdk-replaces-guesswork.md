# Spec: SDK 0.3.143 Replaces Guesswork — Evidence-Anchored

**SDK:** `@anthropic-ai/claude-agent-sdk@0.3.143` (upgraded from 0.2.114, commit `a2aacf8`)
**Source files referenced:** `server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (5722 lines), `sdk-tools.d.ts` (2848 lines)
**Branch:** `master` @ `a2aacf8`
**Created:** 2026-05-16
**Predecessors:** `cc-parity-gaps-round2.md` · `sdk-0.3-findings.md`

This is a strict spec. Every "we can replace X with Y" claim quotes both sides verbatim with file:line citations, the replacement plan, the acceptance criteria, and the verification command anyone can run to re-prove it.

---

## Verification protocol (run before trusting any item)

```bash
# Confirm SDK version landed:
cat server/node_modules/@anthropic-ai/claude-agent-sdk/package.json | python3 -c \
  'import json,sys; print(json.load(sys.stdin)["version"])'
# Expected: 0.3.143

# Confirm sdk.d.ts size (sanity guard against partial install):
wc -l server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
# Expected: 5722 lines
```

If either fails, the citations below may not resolve correctly — reinstall the SDK.

---

## Replacements (CONFIRMED with quoted evidence)

### R-1 — `parent_tool_use_id` replaces the 5-second temporal-proximity heuristic

#### Evidence: SDK provides authoritative dispatcher

`sdk.d.ts:2490-2503`:

```ts
export declare type SDKAssistantMessage = {
    type: 'assistant';
    message: BetaMessage;
    parent_tool_use_id: string | null;
    error?: SDKAssistantMessageError;
    uuid: UUID;
    session_id: string;
    request_id?: string;
    /**
     * Subagent type that produced this message.
     */
    subagent_type?: string;
    /**
     * Description of the subagent task that produced this message.
     */
    task_description?: string;
};
```

Same `parent_tool_use_id: string | null` field also on:
- `SDKUserMessage` (`sdk.d.ts:3229`)
- `SDKPartialAssistantMessage` (`sdk.d.ts:3590`)
- `SDKHookStartedMessage` (`sdk.d.ts:3608`)
- `SDKToolUseSummaryMessage` (`sdk.d.ts:3637`)
- `SDKResultSuccess` (`sdk.d.ts:3690` — always `null` on result)

#### Evidence: we currently guess at the same information

`dashboard/src/lib/agentStatus.ts:44-46`:
```ts
/**
 * Window (ms) for temporal-proximity matching between a main Task/Agent
 * tool_use and the first sidechain event it dispatches. Mirrors
 * `TEMPORAL_DISPATCH_WINDOW_MS` in turnSnapshot.ts.
 */
const DISPATCH_WINDOW_MS = 5000;
```

`dashboard/src/lib/agentStatus.ts:140-178` is a 38-line function `dispatchingToolUseIds()` that walks every main `assistant` event, then every sidechain event, attributing each unbound `agentId` to the first Task/Agent `tool_use` whose timestamp is within 5 s.

`dashboard/src/lib/turnSnapshot.ts:153,166,234` mirrors the same `TEMPORAL_DISPATCH_WINDOW_MS = 5000` heuristic inside `computeDispatchedAgentIds()` (the actual turn-grouping code).

`dashboard/src/lib/agentStatus.ts:186-200` already documents the false-positive risk and falls back to a weaker form when the strict match misses — explicit acknowledgement that the temporal window is a guess.

#### Replacement plan

1. Extend the typed event shape in both packages:
   ```ts
   // server/src/types.ts AssistantEvent and UserEvent
   parent_tool_use_id?: string | null;
   subagent_type?: string;
   task_description?: string;
   ```
2. New helper `getDispatchingToolUseId(event): string | null` that prefers `event.parent_tool_use_id` and falls back to the existing temporal scan when undefined (sessions captured before this field was emitted).
3. Refactor `dispatchingToolUseIds(targetAgentId, events)` to:
   - First pass: walk `events`; for each sidechain event whose `parent_tool_use_id` is non-null AND whose `agentId === targetAgentId`, add `parent_tool_use_id` to the result set.
   - If result is non-empty, return — done.
   - Otherwise fall through to the existing temporal scan.
4. Mirror in `turnSnapshot.ts` `computeDispatchedAgentIds()`.
5. Tests:
   - Existing temporal-window tests pass unchanged (back-compat path).
   - New tests: synthetic events with `parent_tool_use_id` set return immediately without the window walk.

#### Acceptance criteria

- `dispatchingToolUseIds` returns the dispatcher set in **O(events)** instead of **O(events × tool_uses)** when `parent_tool_use_id` is present.
- A test with three concurrent Task dispatches whose JSONL flush is delayed > 5 s STILL attributes correctly because it reads the structured field.
- No regression on the existing temporal-window tests.

#### Verification

```bash
# Re-prove the SDK exposes the field:
grep -n "parent_tool_use_id" server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts | head -10

# After implementation:
cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm vitest run src/lib/agentStatus.test.ts src/lib/turnSnapshot.test.ts
```

---

### R-2 — Import `HOOK_EVENTS` from the SDK; ship 17 missing hook types automatically

#### Evidence: SDK exports the canonical list

`sdk.d.ts:738`:
```ts
export declare const HOOK_EVENTS: readonly [
  "PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch",
  "Notification", "UserPromptSubmit", "UserPromptExpansion",
  "SessionStart", "SessionEnd",
  "Stop", "StopFailure",
  "SubagentStart", "SubagentStop",
  "PreCompact", "PostCompact",
  "PermissionRequest", "PermissionDenied",
  "Setup", "TeammateIdle",
  "TaskCreated", "TaskCompleted",
  "Elicitation", "ElicitationResult",
  "ConfigChange",
  "WorktreeCreate", "WorktreeRemove",
  "InstructionsLoaded", "CwdChanged", "FileChanged"
];
```

29 event types. Also exported as a type alias `sdk.d.ts:757`:
```ts
export declare type HookEvent = 'PreToolUse' | 'PostToolUse' | ... | 'FileChanged';
```

#### Evidence: we list only 12

`dashboard/src/components/panels/HookEditor.tsx:26-40`:
```ts
// CC hook event types (CHANGELOG v2.1.143).
const EVENT_TYPES = [
  "SessionStart",
  "Setup",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "TaskCreated",
  "Notification",
  "Stop",
] as const;
```

Missing 17 (verified by set-diff against SDK's `HOOK_EVENTS`): PostToolBatch, UserPromptExpansion, SessionEnd, StopFailure, PostCompact, PermissionRequest, PermissionDenied, TeammateIdle, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged.

#### Replacement plan

```ts
// dashboard/src/components/panels/HookEditor.tsx
import { HOOK_EVENTS } from "@anthropic-ai/claude-agent-sdk";
const EVENT_TYPES = HOOK_EVENTS;
type EventType = (typeof HOOK_EVENTS)[number];
```

That's it. Future SDK upgrades add hooks automatically.

Also: `dashboard/src/components/conversation/StreamingTurnArea.tsx` PreCompact attribution (B4 commit `890429e`) should be extended to `PostCompact` since the SDK confirms it as a distinct event.

#### Acceptance criteria

- HookEditor renders all 29 event types in lifecycle order (groups: session/turn → prompt → tools → subagent → compact → permissions → tasks → notification → stop → workspace).
- Existing HookEditor tests still pass; one new test asserts `length === 29` and asserts at least one previously-missing event (e.g. PostCompact) renders.
- The B4 PreCompact attribution logic in `server/src/http/sse-event-handler.ts` also handles `PostCompact` attribution analogously.

#### Verification

```bash
# Re-prove SDK list:
grep -A 1 "HOOK_EVENTS:" server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts | head -2

# After implementation:
node -e 'console.log(require("@anthropic-ai/claude-agent-sdk").HOOK_EVENTS.length)'
# Expected: 29

cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm vitest run src/components/panels/__tests__/HookEditor.test.tsx
```

---

### R-3 — `query.getContextUsage()` replaces JSONL `usage`-field aggregation for live sessions

#### Evidence: SDK ships a rich per-category context endpoint

`sdk.d.ts:2148-2156`:
```ts
/**
 * Get a breakdown of current context window usage by category
 * (system prompt, tools, messages, MCP tools, memory files, etc.).
 *
 * @returns Context usage breakdown including token counts per category and total usage
 */
getContextUsage(): Promise<SDKControlGetContextUsageResponse>;
```

Response type (`sdk.d.ts:2634-2724`):
```ts
export declare type SDKControlGetContextUsageResponse = {
    categories: { name; tokens; color; isDeferred? }[];
    totalTokens; maxTokens; rawMaxTokens; percentage;
    model: string;
    memoryFiles:    { path; type; tokens }[];
    mcpTools:       { name; serverName; tokens; isLoaded? }[];
    agents:         { agentType; source; tokens }[];
    slashCommands?: { totalCommands; includedCommands; tokens };
    skills?:        { totalSkills; includedSkills; tokens; skillFrontmatter: {...}[] };
    autoCompactThreshold?: number;
    isAutoCompactEnabled: boolean;
    messageBreakdown?: {
        toolCallTokens; toolResultTokens; attachmentTokens;
        assistantMessageTokens; userMessageTokens;
        redirectedContextTokens; unattributedTokens;
        toolCallsByType:   { name; callTokens; resultTokens }[];
        attachmentsByType: { name; tokens }[];
    };
    apiUsage: {
        input_tokens; output_tokens;
        cache_creation_input_tokens; cache_read_input_tokens;
    } | null;
};
```

#### Evidence: we currently aggregate manually from JSONL

`server/src/analyzer/usage-breakdown.ts` (created in B5 commit `6303cfc`) walks all assistant events in all discovered sessions, sums `usage.input_tokens / output_tokens / cache_*`. That gives us per-model totals but **misses every richer dimension** the SDK exposes (per-MCP-server, per-agent, per-skill, system_prompt overhead, unattributed tokens, autoCompactThreshold).

The choice was made because `getAnthropicUsage()` at `server/src/api/usage-client.ts` only returned utilization percentages from `/api/oauth/usage`. We did not know `query.getContextUsage()` existed.

#### Replacement plan

1. New server route `GET /api/sessions/:sessionId/context-usage`:
   ```ts
   const session = sessionManager.getStatus(req.params.sessionId);
   if (!session?.activeQuery) return res.status(404).json({ error: "session not live" });
   const usage = await session.activeQuery.getContextUsage();
   res.json({ usage });
   ```
2. Dashboard `UsageTab.tsx` fetches `/api/sessions/:id/context-usage` first when a live session is selected; falls back to current `/api/usage/breakdown` (JSONL aggregator) for historical sessions.
3. Render new sections:
   - MCP tool overhead (per server)
   - Per-agent token cost
   - Skills overhead
   - Slash commands overhead
   - Message breakdown bar (tool calls / tool results / attachments / assistant / user / unattributed)
   - autoCompactThreshold as the authoritative 80%-or-whatever line

#### Acceptance criteria

- For live SSE sessions, UsageTab shows ≥ 5 of the new categories (MCP, agents, skills, message breakdown, autoCompactThreshold).
- For historical sessions, behavior unchanged (current breakdown).
- `getContextUsage()` failure (e.g. session ended mid-fetch) gracefully falls back, doesn't crash the tab.
- Test asserting `autoCompactThreshold` is rendered.

#### Verification

```bash
grep -n "getContextUsage\|SDKControlGetContextUsageResponse" server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts | head -5
```

---

### R-4 — `autoCompactThreshold` replaces hardcoded 80% banner

#### Evidence

`sdk.d.ts:2718-2719` (inside `SDKControlGetContextUsageResponse`):
```ts
autoCompactThreshold?: number;
isAutoCompactEnabled: boolean;
```

#### Evidence: we hardcode 80

`dashboard/src/components/conversation/ContextWarningBanner.tsx:43`:
```ts
: `Context window is ${contextPercent}% full. Use /compact to free space.`;
```

CC users have configurable autocompact thresholds (CHANGELOG line 3388: "Increased auto-compact warning threshold from 60% to 80%"). Our copy implies "80% is the limit" but for users with a custom threshold it's wrong.

#### Replacement plan

Same wiring as R-3 — once the dashboard has `SDKControlGetContextUsageResponse`, ContextWarningBanner reads `autoCompactThreshold` and uses it in the copy:
```
"Context is X% full — autocompact will fire at Y%."
```
Falls back to current copy when threshold unknown.

#### Acceptance criteria

- Banner shows the real threshold when known.
- Existing banner tests pass.

---

### R-5 — Narrow enum tightening (`SDKStatus`, `state`, `compact_metadata.trigger`)

#### Evidence

`sdk.d.ts:3455`:
```ts
export declare type SDKStatus = 'compacting' | 'requesting' | null;
```

`sdk.d.ts:3429-3433`:
```ts
export declare type SDKSessionStateChangedMessage = {
    type: 'system';
    subtype: 'session_state_changed';
    state: 'idle' | 'running' | 'requires_action';
    ...
};
```

`sdk.d.ts:2525`:
```ts
trigger: 'manual' | 'auto';   // strict — no reactive/rewind
```

#### Evidence: we typed open string

`dashboard/src/lib/streaming-types.ts:24` — `CompactMetadata.trigger: string`
`server/src/http/sse-event-handler.ts:64` — `type CompactTrigger = "auto" | "manual" | "reactive" | "rewind" | string`

The CHANGELOG mentioned reactive/rewind, but the SDK type proves they're conceptual states, not concrete values.

#### Replacement plan

Narrow the unions to match. Keep a `| string` escape hatch only if needed for forward compat (the SDK type doesn't have one — neither should we).

#### Acceptance criteria

- TypeScript compilation enforces enum membership.
- Existing tests pass.

---

## Confirmed NOT replaceable (current heuristics stay)

### NR-1 — Bounded compact ("Summarize up to here", FU-1)

`sdk.d.ts:2942` enumerates **every** `SDKControlRequestInner` variant:
```
SDKControlInterruptRequest | SDKControlPermissionRequest | SDKControlInitializeRequest |
SDKControlSetPermissionModeRequest | SDKControlSetModelRequest | SDKControlSetMaxThinkingTokensRequest |
SDKControlRenameSessionRequest | SDKControlSetColorRequest | SDKControlMcpStatusRequest |
SDKControlGetContextUsageRequest | SDKControlGetSessionCostRequest |
SDKControlGetBinaryVersionRequest | SDKControlMcpCallRequest | SDKControlFileSuggestionsRequest |
SDKHookCallbackRequest | SDKControlMcpMessageRequest | SDKControlRewindFilesRequest |
SDKControlCancelAsyncMessageRequest | SDKControlReadFileRequest |
SDKControlSeedReadStateRequest | SDKControlMcpSetServersRequest |
SDKControlReloadPluginsRequest | SDKControlMcpReconnectRequest | SDKControlMcpToggleRequest |
SDKControlChannelEnableRequest | SDKControlEndSessionRequest |
SDKControlMcpAuthenticateRequest | SDKControlMcpClearAuthRequest |
SDKControlMcpOAuthCallbackUrlRequest | SDKControlClaudeAuthenticateRequest |
SDKControlClaudeOAuthCallbackRequest | SDKControlClaudeOAuthWaitForCompletionRequest |
SDKControlRemoteControlRequest | SDKControlGenerateSessionTitleRequest |
SDKControlSideQuestionRequest | SDKControlUltrareviewLaunchRequest |
SDKControlMessageRatedRequest | SDKControlOAuthTokenRefreshRequest |
SDKControlStopTaskRequest | SDKControlBackgroundTasksRequest |
SDKControlApplyFlagSettingsRequest | SDKControlGetSettingsRequest |
SDKControlElicitationRequest | SDKControlRequestUserDialogRequest |
SDKControlSubmitFeedbackRequest;
```

No `compact_request` / `summarize_up_to_request` / similar. C1's `summarizeUpTo` at `server/src/session/session-manager.ts:482` correctly dispatches `/compact` as a prompt — best available approach. **Reconfirmed limitation, not a gap.**

### NR-2 — `/loop` and `/goal` markers

Greps:
```bash
grep -E "loop|goal|cron|wakeup|scheduled" server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts | wc -l
```
Returns matches only for the unrelated "loop" comments — no dedicated SDK message types. **Capture-gated work item stands** (P1-3, P1-4).

### NR-3 — Mtime heuristics (`RUNNING_THRESHOLD_MS`, `ACTIVE_WRITE_WINDOW_MS`, `ACTIVE_THRESHOLD_MS`)

Defined in `server/src/cache/session-cache.ts:32-45`. Used in fallback paths (`session-routes.ts:151`, `discovery-routes.ts:16`). The SDK has no per-session running heuristic exposed — the **`~/.claude/sessions/<pid>.json` daemon sidecar** (R2B already shipped) is the authoritative replacement. SDK doesn't offer anything beyond that, so the mtime fallback stays for sessions without a daemon entry (older CC versions).

---

## Bonus SDK APIs we don't yet use (new gaps to track)

| SDK API | What it unlocks | Suggested follow-up gap ID |
|---|---|---|
| `query.supportedAgents(): Promise<AgentInfo[]>` (`sdk.d.ts:2139`) | Replace AgentManager filesystem scan with the authoritative SDK list | NEW-3 |
| `query.mcpServerStatus()` (`sdk.d.ts:2146`) | New "MCP Status" panel: connected / failed / needs-auth / pending | NEW-4 |
| `query.backgroundTasks(toolUseId?)` (`sdk.d.ts:2269`) | "Background this task" button — programmatic Ctrl+B from dashboard | NEW-5 |
| `query.stopTask(taskId)` (`sdk.d.ts:2256`) | Kill button in TasksTab | NEW-6 |
| `SDKTaskStartedMessage` / `TaskProgressMessage` / `TaskNotificationMessage` / `TaskUpdatedMessage` (`sdk.d.ts:3503-3580`) | Structured task lifecycle — extends our current `queued_command` rendering with subagent_type, usage stats, status transitions | NEW-7 |
| `SDKHookStartedMessage` / `HookProgressMessage` / `HookResponseMessage` | Live hook lifecycle on stream — Hooks tab can show in-flight hooks with progress | NEW-8 |
| `SDKPermissionDeniedMessage` (`sdk.d.ts:3175`) | Distinct UI for explicit denials | NEW-9 |

---

## Priority for next loop

1. **R-2 (HOOK_EVENTS import)** — 1 line of code, 17 hook types added, +1 test. Smallest delta, big visibility gain.
2. **R-1 (parent_tool_use_id)** — 4 file types touched, ~80 lines, real correctness win on concurrent Task dispatches.
3. **R-3 + R-4 (getContextUsage + autoCompactThreshold)** — new server route + UsageTab + ContextWarningBanner; rich per-category UI.
4. **R-5 (enum tightening)** — pure hygiene; ship alongside any of the above.
5. **Bonus NEW-3..NEW-9** — pick whichever lights up your debugging today.

All five replacement items + the bonus items are independent. R-1 alone retires a 5-second guess on every subagent rendered.
