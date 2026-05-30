# Research: @anthropic-ai/claude-agent-sdk 0.3.143 → 0.3.156

**Date:** 2026-05-29
**Package:** `@anthropic-ai/claude-agent-sdk`
**Installed (baseline):** `0.3.143` (`server/package.json` pins `^0.3.143`, so `pnpm update` resolves to latest = `0.3.156`)
**Latest / dist-tag `latest` AND `next`:** `0.3.156`
**Versions in range:** 0.3.144, 0.3.145, 0.3.146, 0.3.147, 0.3.148, 0.3.149, 0.3.150, 0.3.151\*, 0.3.152, 0.3.153, 0.3.154, 0.3.156
  (\*0.3.151 and 0.3.155 are in the changelog but not published to npm; 0.3.142, 0.3.155 skipped in npm `versions` list.)

## Headline

**No breaking changes** across the entire 0.3.143 → 0.3.156 range for any API this project consumes. The diff is overwhelmingly "parity with Claude Code v2.1.x" bumps (no SDK TypeScript-surface change), plus two bug fixes (one already covered by the installed peerDeps change, one in an area the project doesn't exercise) and three additive features. **None of the changes touch `query()`, `Options`, `canUseTool`, `PermissionResult`, `SDKMessage`/message types, the hook contract used here, or MCP config in a way that requires code changes.**

The single low-risk action item is upgrading the pin so the bundled Claude Code CLI tracks v2.1.156 (bug fixes + the stdio-MCP-restart fix in 0.3.154 are the practical wins).

## Ground-truth verification (not guesswork)

- `server/node_modules/@anthropic-ai/claude-agent-sdk/package.json` → `"version": "0.3.143"`, and `dependencies: {}` with `peerDependencies` for `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `zod` — i.e. the **0.3.143 peerDependencies change is already in effect locally**.
- The bundled `.d.ts`/`.mjs` files (dated May 16) do **NOT** contain `reloadSkills`, `MessageDisplay`, or `extractFromBunfs` (`grep -c` = 0 in `sdk.mjs`/`assistant.mjs`; absent from `sdk.d.ts`). This positively confirms the installed artifact predates 0.3.144/0.3.152 for the changelog-relevant symbols — the runtime is genuinely 0.3.143-era, so all entries below are real upgrades, not already-shipped.
- Changelog fetched from `https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/CHANGELOG.md` (verbatim entries reproduced below).

## Per-version changelog (verbatim)

- **0.3.156** — Updated to parity with Claude Code v2.1.156
- **0.3.155** — Updated to parity with Claude Code v2.1.155 *(not on npm)*
- **0.3.154** — Fixed stdio MCP servers being incorrectly restarted on every reconcile pass due to config-equality false positives
- **0.3.153** — Updated to parity with Claude Code v2.1.153
- **0.3.152** — `SessionStart` hooks can now return `reloadSkills: true` to trigger a skill re-scan, and set the session title via `hookSpecificOutput.sessionTitle`; added a `MessageDisplay` hook event that lets hooks transform or hide assistant message text as it is displayed
- **0.3.151** — Updated to parity with Claude Code v2.1.151 *(not on npm)*
- **0.3.150** — Updated to parity with Claude Code v2.1.150
- **0.3.149** — Fixed `options.env` dropping `CLAUDE_AGENT_SDK_VERSION` (User-Agent/telemetry) when a custom environment is supplied; corrected the `Options.env` docs to state the value **replaces** the subprocess environment rather than merging with `process.env`
- **0.3.148** — Updated to parity with Claude Code v2.1.148
- **0.3.147** — Updated to parity with Claude Code v2.1.147
- **0.3.146** — Updated to parity with Claude Code v2.1.146
- **0.3.145** — Updated to parity with Claude Code v2.1.145
- **0.3.144** — Assistant messages and `StopFailure` hooks now report `error: 'model_not_found'` (was generic `'invalid_request'`) when the selected model doesn't exist/isn't available; `api_error_status` on result messages is now documented; added `@anthropic-ai/claude-agent-sdk/extract` export for `bun build --compile` (`extractFromBunfs(binPath)` + `options.pathToClaudeCodeExecutable`)
- **0.3.143** (baseline) — `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk` moved from `dependencies` to `peerDependencies` (runtime unaffected — both still bundled; npm/bun/pnpm auto-install; yarn-classic users must add explicitly for full type resolution)

## Breaking changes

**None.** Every entry is backward-compatible:
- The `peerDependencies` move (0.3.143) is already the installed state; pnpm auto-installs peers, so no action.
- `error: 'model_not_found'` (0.3.144) is a **new value within an existing union**, not a removal. The project's SSE handler never branches on the `'invalid_request'` literal (`mapSdkMessageToSSEEvents` reads `msg.message.error` as an opaque string at `sse-event-handler.ts:468`), so this is purely additive to error fidelity.
- `options.env` semantics clarification (0.3.149) is a doc + bugfix; **the project never passes `options.env`** (verified: `query()` options in `session-manager.ts:248-278` set `abortController`, `cwd`, `sessionId`/`resume`, `forkSession`, `includePartialMessages`, `enableFileCheckpointing`, `permissionMode`, `model`, `effort`, `settings`, `canUseTool` — no `env`). The only `env:` references in the codebase are MCP stdio server config, unrelated to `Options.env`.

## New features

See structured `newFeatures` for relevance/UI scoring. Summary:
1. **`@anthropic-ai/claude-agent-sdk/extract` export (0.3.144)** — Bun single-binary compile helper. Not relevant: server runs on Node via pnpm, not `bun build --compile`.
2. **`error: 'model_not_found'` distinct error code (0.3.144)** — lets the dashboard render a precise "model unavailable" banner instead of a generic error. Low-effort UI win in the existing assistant-error path.
3. **`api_error_status` documented on result messages (0.3.144)** — already typed locally (`sdk.d.ts:3363 api_error_status?: number | null`). The SSE result mapper (`sse-event-handler.ts:767-801`) could forward it for richer error surfacing.
4. **`SessionStart` hook `reloadSkills` + `sessionTitle` (0.3.152)** — hook-authoring features; the dashboard consumes hook *results*, doesn't author SessionStart hooks. Low relevance.
5. **`MessageDisplay` hook event (0.3.152)** — new hook event for transforming/hiding assistant text. Not consumed by this project's hook lifecycle SSE (`hook_started`/`hook_progress`/`hook_response`); would only matter if the dashboard later visualizes MessageDisplay hooks.
6. **stdio-MCP restart fix (0.3.154)** — reliability fix. Indirectly improves `getMcpServerStatus()` accuracy for live sessions with stdio MCP servers (fewer spurious "restarting" states), but it's a CLI-internal fix with no API surface.

## Cross-reference: project usage

**`server/src/session/session-manager.ts`** — heavy SDK consumer. Uses `query()` (dynamic import, line 222), `canUseTool` callback (266-277), `PermissionResult`/`PermissionUpdate` types, and a rich set of mid-session `Query` methods: `setPermissionMode`, `setModel`, `rewindFiles`, `getContextUsage`, `mcpServerStatus`, `supportedAgents`, `supportedCommands`, `stopTask`, `backgroundTasks`. **None of these signatures changed in the range.** The `PermissionResult` union (`allow`/`deny` with optional `updatedInput`/`updatedPermissions`/`toolUseID`/`decisionClassification`) and `CanUseTool` options bag (`title`/`displayName`/`description`/`suggestions`/`toolUseID`/`agentID`/`blockedPath`/`decisionReason`) are unchanged and fully consumed.

**`server/src/http/sse-event-handler.ts`** — maps `SDKMessage` types to SSE. Imports `SDKCompactBoundaryMessage`, `SDKSessionStateChangedMessage`, `SDKStatus`. Handles `stream_event`, `assistant`, `user`, `tool_progress`, `system` subtypes (`status`, `compact_boundary`, `init`, `task_started/progress/notification/updated`, `session_state_changed`, `api_retry`, `hook_started/progress/response`, `permission_denied`), `auth_status`, `tool_use_summary`, `rate_limit_event`, `prompt_suggestion`, `local_command_output`, `result`. **No message type was removed or renamed in the range.** The new `MessageDisplay` is a *hook event* (server-side hook config), not an SDK *message* in the `query()` stream, so it does not appear here and requires no mapper change.

## Recommendation

- **Upgrade safe.** Bump to `0.3.156` (`pnpm -C server update @anthropic-ai/claude-agent-sdk@latest`). Expected impact: zero code changes; gains are the bundled Claude Code v2.1.156 fixes + the stdio-MCP-restart fix (0.3.154) + finer `model_not_found` error code.
- **Optional follow-ups (additive, not required):**
  - Branch on `msg.message.error === 'model_not_found'` in `sse-event-handler.ts` (line ~468) to render a dedicated "Model unavailable — pick another model" UI instead of the generic assistant-error banner.
  - Forward `api_error_status` from the SDK `result` message into `SSEResultEvent` for richer error diagnostics in the Usage/result UI.
- **Validate after bump:** `tsc --noEmit` in `server/`, then `pnpm -C server test`. Type-surface is unchanged, so a clean typecheck is the expected (and sufficient) signal.

## Sources

- `https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/CHANGELOG.md`
- `npm view @anthropic-ai/claude-agent-sdk versions/dist-tags` (latest = next = 0.3.156)
- Local: `server/node_modules/@anthropic-ai/claude-agent-sdk/{package.json,sdk.d.ts,sdk.mjs,assistant.mjs}`
- Local usage: `server/src/session/session-manager.ts`, `server/src/http/sse-event-handler.ts`
