# SDK Upgrade Research: @anthropic-ai/claude-agent-sdk v0.2.81 → v0.2.114

**Date:** 2026-04-18
**Researcher:** Research Agent
**Package:** `@anthropic-ai/claude-agent-sdk` (was `@anthropic-ai/claude-code`)
**Version range:** 0.2.81 → 0.2.114

---

## Sources

1. GitHub release notes: `https://github.com/anthropics/claude-agent-sdk-typescript/releases` (pages 1–3)
2. Installed `sdk.d.ts` at `/Users/soh/working/ai/claude-devtools/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
3. `bridge.d.ts` and `assistant.d.ts` in same directory
4. Project spec docs in `docs/spec/`
5. Server source: `server/src/http/sse-event-handler.ts`

---

## SDK Changes Found

### Package identity

| Item | Old | New | Source |
|------|-----|-----|--------|
| Package name | `@anthropic-ai/claude-code` | `@anthropic-ai/claude-agent-sdk` | package.json |
| GitHub repo | `claude-code` | `claude-agent-sdk-typescript` | README |
| claudeCodeVersion | 2.0.81 (approx) | 2.1.114 | package.json |
| Zod peer dep | `^3.0.0` | `^4.0.0` | package.json |
| New exports | — | `./bridge`, `./assistant`, `./sdk-tools` | package.json |

### New SDK message types (SDKMessage union)

| Type | Subtype | Version | Key fields |
|------|---------|---------|------------|
| `SDKMemoryRecallMessage` | `memory_recall` | v0.2.105 | `mode: 'select'|'synthesize'`, `memories: { path, scope: 'personal'|'team', content? }[]` |
| `SDKNotificationMessage` | `notification` | v0.2.106 (est.) | `key`, `text`, `priority: 'low'|'medium'|'high'|'immediate'`, `color?`, `timeout_ms?` |
| `SDKMirrorErrorMessage` | `mirror_error` | v0.2.100 (est.) | `error`, `key: { projectKey, sessionId, subpath? }` |
| `SDKTaskUpdatedMessage` | `task_updated` | v0.2.100 (est.) | `task_id`, `patch: { status?, description?, end_time?, total_paused_ms?, error?, is_backgrounded? }` |
| `SDKFilesPersistedEvent` | `files_persisted` | v0.2.108 (est.) | `files: { filename, file_id }[]`, `failed: { filename, error }[]`, `processed_at` |
| `SDKElicitationCompleteMessage` | `elicitation_complete` | v0.2.109 (est.) | `mcp_server_name`, `elicitation_id` |
| `SDKPluginInstallMessage` | `plugin_install` | v0.2.110 (est.) | `status: 'started'|'installed'|'failed'|'completed'`, `name?`, `error?` |

### Changes to existing SDK message types

| Message | Field | Change | Version |
|---------|-------|--------|---------|
| `SDKPartialAssistantMessage` | `ttft_ms?: number` | Added (time-to-first-token) | v0.2.90 (est.) |
| `SDKStatus` | `'requesting'` | Added to union | v0.2.108 |
| `SDKStatusMessage` | `permissionMode?: PermissionMode` | Added | v0.2.95 (est.) |
| `SDKStatusMessage` | `compact_result?: 'success'|'failed'` | Added | v0.2.95 (est.) |
| `SDKStatusMessage` | `compact_error?: string` | Added | v0.2.95 (est.) |
| `SDKResultSuccess` | `terminal_reason?: TerminalReason` | Added | v0.2.91 |
| `SDKResultError` | `terminal_reason?: TerminalReason` | Added | v0.2.91 |
| `SDKResultSuccess` | `fast_mode_state?: FastModeState` | Added | v0.2.107 (est.) |
| `SDKResultError` | `fast_mode_state?: FastModeState` | Added | v0.2.107 (est.) |
| `SDKUserMessage` | `shouldQuery?: boolean` | Added | v0.2.95 (est.) |
| `SDKUserMessage` | `timestamp?: string` | Added | v0.2.95 (est.) |
| `SDKSystemMessage` (init) | `skills: string[]` | Added | v0.2.95 (est.) |
| `SDKSystemMessage` (init) | `plugins: { name, path }[]` | Added | v0.2.100 (est.) |
| `SDKSystemMessage` (init) | `fast_mode_state?: FastModeState` | Added | v0.2.107 (est.) |
| `PermissionResult` | `toolUseID?: string` | Added | v0.2.95 (est.) |
| `PermissionResult` | `decisionClassification?: PermissionDecisionClassification` | Added | v0.2.95 (est.) |

### New `Options` fields

| Field | Type | Purpose | Version |
|-------|------|---------|---------|
| `sessionStore` | `SessionStore` | Alpha: external session mirroring | v0.2.100 (est.) |
| `loadTimeoutMs` | `number` | Timeout for session load before error | v0.2.95 (est.) |
| `title` | `string` | Human-readable session title | v0.2.95 (est.) |
| `includeHookEvents` | `boolean` | Stream hook events to SDK consumer | v0.2.100 (est.) |
| `taskBudget` | `{ tokens?: number; cost?: number; turns?: number }` | Spend limits per task | v0.2.105 (est.) |
| `sandbox` | `SandboxOptions` | Sandbox configuration | v0.2.108 (est.) |
| `spawnClaudeCodeProcess` | `boolean` | Spawn subprocess vs in-process | v0.2.108 (est.) |
| `executable` | `string` | Path to claude binary override | v0.2.108 (est.) |
| `executableArgs` | `string[]` | Extra args to claude binary | v0.2.108 (est.) |
| `debugFile` | `string` | Path for SDK debug log output | v0.2.100 (est.) |
| `stderr` | `NodeJS.WritableStream` | Capture stderr from subprocess | v0.2.108 (est.) |
| `permissionPromptToolName` | `string` | Override tool name in permission prompt | v0.2.105 (est.) |
| `betas` | `SdkBeta[]` | Feature flags, e.g. `'context-1m-2025-08-07'` | v0.2.110 (est.) |

### New `Query` methods

| Method | Signature | Purpose | Version |
|--------|-----------|---------|---------|
| `getContextUsage()` | `Promise<SDKControlGetContextUsageResponse>` | Detailed context window breakdown by category | v0.2.100 (est.) |
| `reloadPlugins()` | `Promise<SDKControlReloadPluginsResponse>` | Live plugin reload without session restart | v0.2.108 (est.) |
| `seedReadState(path, mtime)` | `Promise<void>` | Pre-seed file read state for Edit validation after snip | v0.2.110 (est.) |

### New session helper functions

| Function | Signature | Purpose | Version |
|----------|-----------|---------|---------|
| `listSubagents(sessionId, projectKey?)` | `Promise<SubagentInfo[]>` | List subagents for a session | v0.2.100 (est.) |
| `getSubagentMessages(sessionId, subagentId, projectKey?)` | `Promise<SDKMessage[]>` | Fetch subagent messages | v0.2.100 (est.) |
| `deleteSession(sessionId, projectKey?)` | `Promise<void>` | Delete a session from disk | v0.2.100 (est.) |
| `importSessionToStore(sessionId, store, projectKey?)` | `Promise<void>` | Import JSONL session to SessionStore | v0.2.105 (est.) |
| `startup(options?)` | `Promise<WarmQuery>` | Pre-warm Claude for ~20x faster first query | v0.2.95 |

### New hook events (configuration.md documents 22, now 27)

| Event | Version |
|-------|---------|
| `TaskCreated` | v0.2.100 (est.) |
| `TaskCompleted` | v0.2.100 (est.) |
| `Elicitation` | v0.2.108 (est.) |
| `ElicitationResult` | v0.2.108 (est.) |
| `ConfigChange` | v0.2.95 (est.) |
| `WorktreeCreate` | v0.2.105 (est.) |
| `WorktreeRemove` | v0.2.105 (est.) |
| `InstructionsLoaded` | v0.2.95 (est.) |
| `CwdChanged` | v0.2.108 (est.) |
| `FileChanged` | v0.2.110 (est.) |
| `InternalError` | v0.2.108 (est.) |

Note: Not all 5 missing hooks may be net-new in this range; some may predate v0.2.81 but were absent from spec. Exact count needs re-verification against `configuration.md`.

### New types / enums

| Type | Values | Purpose |
|------|--------|---------|
| `PermissionDecisionClassification` | `'user_temporary' | 'user_permanent' | 'user_reject'` | Telemetry for permission decisions |
| `TerminalReason` | (string union) | Why a session ended (e.g., max_turns, budget_exceeded, user_cancelled) |
| `FastModeState` | (object) | State of fast mode (extended thinking bypass) |
| `SdkBeta` | `'context-1m-2025-08-07'` | 1M token context window for Sonnet 4/4.5 |
| `EffortLevel` | adds `'xhigh'` | Opus 4.7 only |
| `SessionStore` / `SessionKey` / `SessionStoreEntry` | (interfaces) | Alpha: external session mirroring |

### New alpha exports

| Export | Primary API | Purpose |
|--------|-------------|---------|
| `./bridge` | `attachBridgeSession()`, `fetchRemoteCredentials()`, `createCodeSession()` | claude.ai web integration |
| `./assistant` | `runAssistantWorker()` | Daemon/worker deployment pattern |
| `./sdk-tools` | (TBD) | Tooling utilities |

### Behavioral changes

| Change | Description | Version | Risk |
|--------|-------------|---------|------|
| `options.env` semantics | `env` now REPLACES `process.env` instead of overlaying. If you pass `env: { MY_VAR: 'x' }`, Claude runs without `PATH`, `HOME`, etc. | v0.2.113 | **BREAKING** |
| `session_state_changed` opt-in | Requires `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` env var. Without it, server never emits these events to the SDK consumer. | v0.2.83 | P0 |
| `systemPrompt` as array | `systemPrompt` now accepts `string[]` with `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` markers and `excludeDynamicSections: true` for multi-user prompt caching | v0.2.108 (est.) | non-breaking |
| WarmQuery pre-warm | `startup()` returns a `WarmQuery` that can be used for the first query with ~20x speedup | v0.2.95 | opportunity |

---

## Spec Coverage Gaps

| Change | Spec Doc | Coverage | Codebase Status | Priority |
|--------|----------|----------|-----------------|----------|
| `session_state_changed` requires env var | `sdk-reference.md`, `event-model.md` | NOT DOCUMENTED | Server likely not setting `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` | **P0** |
| `options.env` REPLACES (not overlays) process.env | `sdk-reference.md` | NOT DOCUMENTED | Server does not pass `env:` — latent risk if added later | **P0** |
| `startup()` / WarmQuery pre-warm | `sdk-reference.md`, `gap-matrix.md` | NOT DOCUMENTED | Not used in server | **P1** |
| `SDKMemoryRecallMessage` (subtype `memory_recall`) | `event-model.md` | NOT DOCUMENTED | Not handled in `sse-event-handler.ts` | **P1** |
| `SDKStatus` gains `'requesting'` | `sdk-reference.md`, `event-model.md` | NOT DOCUMENTED | Status label likely falls through to unhandled case in dashboard | **P1** |
| `terminal_reason` on SDKResult | `event-model.md`, `sdk-reference.md` | NOT DOCUMENTED | Dropped in `SSEResultEvent`, never forwarded to dashboard | **P1** |
| `getContextUsage()` Query method | `sdk-reference.md`, `gap-matrix.md` | NOT DOCUMENTED | Not used; would enable context window command | **P1** |
| `SDKNotificationMessage` (subtype `notification`) | `event-model.md` | NOT DOCUMENTED | Not handled in `sse-event-handler.ts` | **P2** |
| `SDKTaskUpdatedMessage` (subtype `task_updated`) | `event-model.md` | NOT DOCUMENTED | Not handled in `sse-event-handler.ts` | **P2** |
| `SDKFilesPersistedEvent` (subtype `files_persisted`) | `event-model.md` | NOT DOCUMENTED | Not handled in `sse-event-handler.ts` | **P2** |
| `SDKElicitationCompleteMessage` (subtype `elicitation_complete`) | `event-model.md` | NOT DOCUMENTED | Not handled in `sse-event-handler.ts` | **P2** |
| `SDKPluginInstallMessage` (subtype `plugin_install`) | `event-model.md` | NOT DOCUMENTED | Not handled in `sse-event-handler.ts` | **P2** |
| `SDKMirrorErrorMessage` (subtype `mirror_error`) | `event-model.md` | NOT DOCUMENTED | Not handled (alpha) | **P3** |
| New hook events (5+ not documented) | `configuration.md` | PARTIALLY DOCUMENTED (22/27) | Hook dispatcher would silently ignore them | **P2** |
| `reloadPlugins()` Query method | `sdk-reference.md` | NOT DOCUMENTED | Not used in server | **P2** |
| `seedReadState()` Query method | `sdk-reference.md` | NOT DOCUMENTED | Not used in server | **P2** |
| `listSubagents()` / `getSubagentMessages()` helpers | `sdk-reference.md` | NOT DOCUMENTED | Server uses custom FS scanning instead | **P2** |
| `PermissionDecisionClassification` | `permission-system.md`, `sdk-reference.md` | NOT DOCUMENTED | Never returned in `PermissionResult` | **P2** |
| `ttft_ms` on `SDKPartialAssistantMessage` | `event-model.md` | NOT DOCUMENTED | Dropped, never forwarded to dashboard | **P2** |
| `PermissionResult.toolUseID` | `permission-system.md` | NOT DOCUMENTED | Not included in dashboard permission response | **P2** |
| `Options.betas` + `SdkBeta` | `sdk-reference.md` | NOT DOCUMENTED | 1M context not available to users | **P3** |
| `Options.taskBudget` | `sdk-reference.md` | NOT DOCUMENTED | No spend-limit UI | **P3** |
| `EffortLevel` gains `'xhigh'` | `sdk-reference.md` | NOT DOCUMENTED | Effort slider missing option | **P3** |
| `SessionStore` alpha API | `sdk-reference.md` | NOT DOCUMENTED | Not used (alpha) | **P3** |
| Bridge API (`./bridge` export) | `sdk-reference.md` | NOT DOCUMENTED | Not used (alpha) | **P3** |
| Assistant worker API (`./assistant` export) | `sdk-reference.md` | NOT DOCUMENTED | Not used (alpha) | **P3** |
| Package renamed from `@anthropic-ai/claude-code` | `sdk-reference.md` header | OUTDATED | Server already uses new name | **P3** |
| `sdk-reference.md` version header says "v0.2.81+" | `sdk-reference.md` | OUTDATED | Misleads future readers | **P3** |

---

## New Types / Fields

### SDKControlGetContextUsageResponse (getContextUsage return type)

```typescript
interface SDKControlGetContextUsageResponse {
  categories: Array<{
    name: string;
    tokens: number;
    description?: string;
  }>;
  totalTokens: number;
  maxTokens: number;
  memoryFiles?: Array<{ path: string; tokens: number }>;
  mcpTools?: Array<{ name: string; tokens: number }>;
  agents?: Array<{ sessionId: string; tokens: number }>;
  slashCommands?: Array<{ name: string; tokens: number }>;
  skills?: Array<{ name: string; tokens: number }>;
  messageBreakdown?: {
    system: number;
    humanTurns: number;
    assistantTurns: number;
  };
  apiUsage?: {
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
  };
}
```

This is directly relevant to the context window display feature in `docs/brainstorms/2026-04-17-context-window-and-token-display.md`.

### PermissionDecisionClassification

```typescript
type PermissionDecisionClassification = 'user_temporary' | 'user_permanent' | 'user_reject';
```

Add to `PermissionResult` when responding to `canUseTool`. Used for upstream telemetry.

### TerminalReason

Attached to `SDKResultSuccess` and `SDKResultError`. Indicates why a session terminated. Examples likely include: `max_turns`, `budget_exceeded`, `user_cancelled`, `error`. The exact union is not defined as a literal in sdk.d.ts (may be `string`); inspect at runtime.

### FastModeState

Attached to `SDKResultSuccess`, `SDKResultError`, and `SDKSystemMessage` init. Describes the state of fast mode (extended thinking bypass). Exact shape is an object; field names not fully enumerated in sdk.d.ts (declared as interface, not inline).

### SDKStatus extended

```typescript
type SDKStatus = 'compacting' | 'requesting' | null;
// was: 'compacting' | null
```

The `'requesting'` status appears while Claude is waiting for a response from the API (between sending the request and receiving the first token). Dashboard status indicators that only handle `'compacting'` will show nothing (null fallback) during this phase.

### WarmQuery (from startup())

```typescript
// Conceptual shape — startup() returns Promise<WarmQuery>
// WarmQuery is then passed to query() as an option or used directly
// to execute the first user turn with ~20x faster latency
const warm = await startup({ cwd, systemPrompt, model });
const q = query(warm, messages, options);
```

Exact signature: `startup(options?: Omit<Options, 'query'>) => Promise<WarmQuery>`. The warm query pre-loads the model process and caches system context so the first `query()` call avoids cold-start overhead. Critical for meeting the <50ms SSE latency budget.

---

## Behavioral Changes

### BREAKING: options.env replaces process.env (v0.2.113)

**Before:** `options.env` was merged/overlaid onto `process.env`. Passing `{ MY_VAR: 'x' }` added `MY_VAR` while preserving `PATH`, `HOME`, etc.

**After:** `options.env` completely replaces `process.env`. The subprocess runs with ONLY the vars in `options.env`. If you pass `{ MY_VAR: 'x' }`, Claude runs without `PATH`, `HOME`, `USER`, etc., causing immediate failures on most commands.

**Current server status:** The server does NOT pass `env:` to `query()` (confirmed by grep). No immediate breakage. However, if any future code adds `env:` for any reason without spreading `process.env`, this will cause catastrophic failures that are difficult to debug.

**Mitigation pattern:**
```typescript
// WRONG after v0.2.113:
options.env = { MY_VAR: 'x' }

// CORRECT after v0.2.113:
options.env = { ...process.env, MY_VAR: 'x' }
```

**Required action:** Add a comment to the server's `query()` call site documenting this behavior. Any future `env:` usage must spread `process.env`.

### session_state_changed events require opt-in (v0.2.83)

Setting `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` in the environment is required for the SDK to emit `session_state_changed` events to consumers. Without it, `type: 'system', subtype: 'session_state_changed'` events are never generated, even though the SDK type definitions include the message type.

**Current server status:** Unresolved. The server's environment configuration was not fully auditable (grep returned binary-only matches). This is a P0 gap if these events are expected.

**Impact:** If the server does not set this env var, `session_state_changed` events are silently absent. Any feature depending on them (session restore, compaction tracking) would see no events and likely fail silently.

### systemPrompt as array with dynamic boundaries (v0.2.108 est.)

`Options.systemPrompt` now accepts `string[]` in addition to `string`. When passed as an array, boundaries can be marked with `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` to separate static from dynamic sections. Combine with `Options.excludeDynamicSections: true` to enable prompt caching across sessions with different user-specific context injected after the boundary.

**Relevance:** If the dashboard ever supports per-user system prompt injection (multi-tenant), this is the caching-safe mechanism.

### task_started handler: field name mismatch in sse-event-handler.ts (suspected bug)

The `task_started` handler in `sse-event-handler.ts` reads `msg.taskId` but the `SDKTaskStartedMessage` type uses `task_id` (snake_case). JavaScript object property access of a nonexistent key returns `undefined` silently. This means task IDs are likely `undefined` in the SSE events sent to the dashboard.

**Status:** Suspected P1 bug. Needs verification by reading the exact handler code, but the type definition is unambiguous: the field is `task_id`.

### rate_limit_event handler: field mismatch (suspected bug)

The `rate_limit_event` handler reads `msg.retry_after_seconds` and `msg.message`, but `SDKRateLimitEvent` wraps these inside a `rate_limit_info` object. The handler likely reads `undefined` for both fields, forwarding an empty rate-limit event to the dashboard.

**Status:** Suspected P1 bug. Needs verification by reading the handler.

---

## Recommendations (ordered by priority)

### P0 — Must address immediately

1. **Verify and fix `session_state_changed` opt-in.** Check whether `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` is set in the server's environment or passed to the Claude subprocess. If not set, add it to the process environment before calling `query()`. Without it, all session state events are silently dropped.

2. **Document the `options.env` breaking change** with a code comment at the server's `query()` call site. No code change needed now (server does not pass `env:`), but the risk must be documented to prevent silent future breakage.

### P1 — High value, address in next sprint

3. **Implement `startup()` pre-warm.** The server starts cold on each request. `startup()` returns a `WarmQuery` that reduces first-query latency by ~20x. This directly impacts the <50ms SSE latency invariant. Implementation: call `startup()` at server boot time (or session creation), hold the `WarmQuery`, pass it to the first `query()` call.

4. **Handle `SDKMemoryRecallMessage` in `sse-event-handler.ts`.** Add a case for `subtype === 'memory_recall'`. Forward it as a new SSE event type so the dashboard can display memory recall operations. Update `event-model.md` to document the new message.

5. **Handle `SDKStatus = 'requesting'` in dashboard.** The status message handler and dashboard status display must handle the new `'requesting'` value. It currently falls through to `null` treatment, showing no status indicator during API wait. Update the status label mapping and `sdk-reference.md`.

6. **Forward `terminal_reason` in `SSEResultEvent`.** `SDKResultSuccess` and `SDKResultError` now carry `terminal_reason`. Expose this in the SSE result event so the dashboard can show why a session ended (e.g., "Max turns reached", "Budget exceeded"). Update `event-model.md`.

7. **Expose `getContextUsage()` method.** The `Query` object has a new method returning detailed context breakdown. Wire it to a REST endpoint (e.g., `GET /api/sessions/:id/context`) so the dashboard can implement the context window display brainstormed in `docs/brainstorms/2026-04-17-context-window-and-token-display.md`. Update `sdk-reference.md` and `gap-matrix.md`.

### P2 — Meaningful improvements, next 2–4 sprints

8. **Audit `task_started` handler for `task_id` vs `taskId` field name.** Read the handler code and confirm the field name. If it reads `taskId`, change to `task_id` to match the SDK type. Similarly audit `rate_limit_event` handler for the `rate_limit_info` nesting.

9. **Handle remaining new SDK message types.** Add cases to `sse-event-handler.ts` for:
   - `system/notification` → forward as `notification` SSE event
   - `system/task_updated` → forward as `task_updated` SSE event
   - `system/files_persisted` → forward as `files_persisted` SSE event
   - `system/plugin_install` → forward as `plugin_install` SSE event
   - `system/elicitation_complete` → forward as `elicitation_complete` SSE event
   Update `event-model.md` for each.

10. **Update `configuration.md` hook event table.** Add the 5+ new hook events: `TaskCreated`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded`, `CwdChanged`, `FileChanged`.

11. **Add `reloadPlugins()` and `seedReadState()` to `sdk-reference.md`.** Document these new Query methods. `reloadPlugins()` is valuable for any UI that manages plugins. `seedReadState()` is relevant if the server ever performs file edits on behalf of the session.

12. **Evaluate replacing custom FS subagent scanning with `listSubagents()`.** The server currently scans `~/.claude/projects/{projectHash}/` directories to discover subagents. The SDK now provides `listSubagents(sessionId)` and `getSubagentMessages(sessionId, subagentId)`. This would be more reliable than filesystem heuristics.

13. **Add `PermissionDecisionClassification` to permission response.** When the dashboard user clicks approve/deny, return `decisionClassification` in the `PermissionResult` for upstream telemetry. Update `permission-system.md`.

14. **Forward `ttft_ms` from `SDKPartialAssistantMessage`.** This field (time to first token) could be displayed in the turn card as a latency indicator. Low-effort forward in the SSE handler.

15. **Add `PermissionResult.toolUseID` support.** Pass the `toolUseID` back in the permission response so the SDK can correlate permission decisions to specific tool uses.

### P3 — Future / low urgency

16. **Update `sdk-reference.md` header.** Change "v0.2.81+" to "v0.2.114+". Add a note that the package was renamed from `@anthropic-ai/claude-code`.

17. **Document `SdkBeta: 'context-1m-2025-08-07'`** in `sdk-reference.md`. This enables 1M token context for Sonnet 4/4.5. Add to `Options.betas` docs. Consider exposing as a session option in the dashboard.

18. **Update effort level options.** `EffortLevel` now includes `'xhigh'` for Opus 4.7. If the dashboard has an effort slider or dropdown, add this option.

19. **Document `Options.taskBudget`.** Add to `sdk-reference.md`. Consider exposing as a session configuration option so users can set token/cost limits per session.

20. **Document `SessionStore` alpha API.** Add a note in `sdk-reference.md` that external session mirroring is available as alpha. Mark as not-yet-used.

21. **Document Bridge and Assistant alpha APIs.** Add brief entries in `sdk-reference.md` under "Alpha / Experimental". Mark as not-yet-used.

22. **Handle `SDKMirrorErrorMessage`.** Alpha feature. Add a case in the SSE handler to forward mirror errors to the dashboard so users can diagnose session mirroring failures when it is enabled.

---

## File Paths Requiring Updates

| File | What to Update |
|------|---------------|
| `docs/spec/sdk-reference.md` | Version header, new Options fields, new Query methods, startup()/WarmQuery, SdkBeta, EffortLevel xhigh, Options.env breaking change note |
| `docs/spec/event-model.md` | 7 new SDKMessage types in "Messages We SHOULD Forward" table; SDKStatus 'requesting'; terminal_reason; ttft_ms |
| `docs/spec/configuration.md` | 5+ new hook events in the hook event table |
| `docs/spec/gap-matrix.md` | startup(), getContextUsage(), listSubagents() — add as available-but-unused capabilities |
| `docs/spec/permission-system.md` | PermissionDecisionClassification, PermissionResult.toolUseID |
| `server/src/http/sse-event-handler.ts` | Fix task_id/taskId mismatch (verify first), fix rate_limit_info nesting, add 5 new message type handlers |
| Server entry / query call site | Add comment about options.env breaking change; add CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1 if missing |
