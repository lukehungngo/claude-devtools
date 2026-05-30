# SDK Bump Impact Audit

**Date:** 2026-05-29
**Scope:** Bump `@anthropic-ai/sdk` 0.96.0 → 0.100.1 and `@anthropic-ai/claude-agent-sdk` 0.3.143 → 0.3.156.
**Method:** Local grep + Read of every SDK call site, cross-checked against the *installed* type
definitions (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, `server/node_modules/@anthropic-ai/sdk/...`),
lockfiles, and the published agent-sdk changelog highlights (WebSearch).
Ground truth = installed `.d.ts` at the current pinned version + changelog for the target range.

---

## Executive Summary

**Overall risk: LOW.** No code-level breaking change was confirmed against the 0.3.143→0.3.156 changelog.
The three documented agent-SDK breaking changes in this range do not touch any code site:
- **Removed v2 session API** (`unstable_v2_createSession`, `SDKSession`, `SDKSessionOptions`, …) — **not used**.
  We use `SDKSessionStateChangedMessage`, a distinct *message* type that is retained.
- **TodoWrite → Task tools** for headless/SDK sessions — **already handled.** `analyzer/metrics.ts:59-66`
  parses `TaskCreate`/`TaskUpdate` AND `TodoWrite`.
- **MCP background connect (`status: "pending"`)** — additive; our `ExtendedMcpServerStatus` widens
  the union and the dashboard already renders `pending` (it is in the existing SDK union).

The genuine risks are (a) the agent SDK's TypeScript surface **deep-imports types from `@anthropic-ai/sdk`**,
so the two bumps are coupled and must move together; (b) lockfile drift between the root lock and the stale
`server/pnpm-lock.yaml`; (c) several `as`/`as unknown as` casts that would *silently* hide a shape change
rather than surface it as a compile error.

Baseline `cd server && npx tsc --noEmit` is **clean (exit 0)** at the current pinned versions.

---

## Inventory: every SDK site

### Direct `@anthropic-ai/claude-agent-sdk` consumers (production)

| File:line | Symbol(s) used | Kind |
|---|---|---|
| `server/src/session/session-manager.ts:6` | `AgentInfo`, `McpServerStatus`, `PermissionResult`, `PermissionUpdate`, `Query`, `RewindFilesResult`, `SDKControlGetContextUsageResponse`, `PermissionMode` (as `SdkPermissionMode`) | type-only import |
| `server/src/session/session-manager.ts:222` | `query` | dynamic import, runtime |
| `server/src/session/session-manager.ts:246-279` | `query({ prompt, options })` — `Options` fields: `abortController`, `cwd`, `sessionId`/`resume`, `forkSession`, `includePartialMessages`, `enableFileCheckpointing`, `permissionMode`, `allowDangerouslySkipPermissions`, `model`, `effort`, `settings.fastMode`, `canUseTool` | call shape |
| `server/src/session/session-manager.ts:266-277` | `canUseTool` callback: `options.title/displayName/description/suggestions/toolUseID/agentID` + cast-read `blockedPath`/`decisionReason` | callback contract |
| `server/src/session/session-manager.ts:285-291` | `Query.supportedCommands()` | Query method |
| `server/src/session/session-manager.ts:261,389` | `permissionMode as unknown as SdkPermissionMode` | cast (hides break) |
| `server/src/session/session-manager.ts:387-391` | `Query.setPermissionMode()` | Query method |
| `server/src/session/session-manager.ts:488-489` | `Query.setModel()` | Query method |
| `server/src/session/session-manager.ts:527-534` | `Query.rewindFiles(userMessageId, { dryRun })` → `RewindFilesResult` | Query method |
| `server/src/session/session-manager.ts:677-685` | `Query.getContextUsage()` → `SDKControlGetContextUsageResponse` | Query method |
| `server/src/session/session-manager.ts:713-730` | `Query.mcpServerStatus()` → `McpServerStatus[]` | Query method |
| `server/src/session/session-manager.ts:739-748` | `Query.supportedAgents()` → `AgentInfo[]` | Query method |
| `server/src/session/session-manager.ts:758-768` | `Query.stopTask(taskId)` | Query method |
| `server/src/session/session-manager.ts:777-786` | `Query.backgroundTasks(toolUseId?)` → `boolean` | Query method |
| `server/src/session/session-manager.ts:22-23,71-78` | `McpServerStatus` (Omit/extend → `ExtendedMcpServerStatus`), `McpServerStatusConfig` (structural cast) | type extension |
| `server/src/session/session-manager.ts:91,125` | `PermissionUpdate` (suggestions), `PermissionResult` | types |
| `server/src/http/sse-event-handler.ts:6-10` | `SDKCompactBoundaryMessage`, `SDKSessionStateChangedMessage`, `SDKStatus` | type-only import |
| `server/src/http/sse-event-handler.ts:65` | `SDKCompactBoundaryMessage["compact_metadata"]["trigger"]` (= `'manual'|'auto'`) | indexed type |
| `server/src/http/sse-event-handler.ts:270` | `SDKSessionStateChangedMessage["state"]` (= `'idle'|'running'|'requires_action'`) | indexed type |
| `server/src/http/routes/session-routes.ts:918-919` | `renameSession(sessionId, title)` | dynamic import, runtime fn |

> `mapSdkMessageToSSEEvents()` (sse-event-handler.ts:399-804) consumes SDK *runtime* messages via a
> structurally-typed `{ type: string; [key: string]: any }` parameter — it does NOT import SDK runtime
> types for the message bodies, so message-shape additions are tolerated by design (it reads fields
> defensively with `??` and `typeof` guards). This is the safest pattern in the codebase.

### Direct `@anthropic-ai/sdk` consumers (production)

| File:line | Symbol(s) used | Kind |
|---|---|---|
| `server/src/http/routes/efficiency-routes.ts:150-164` | `import Anthropic` (default), `new Anthropic()`, `client.messages.stream({ model, max_tokens, system, messages })`, stream events `content_block_delta` + `delta.type === "text_delta"` + `delta.text` | dynamic import, runtime |

### `mcp/src`

- **No direct SDK imports.** `mcp/` consumes `claude-devtools-server` as a workspace library
  (`mcp/package.json` deps). Confirmed via `rg "@anthropic-ai" mcp/src` → no matches. **Zero direct risk.**

### Tests (mocks — low brittleness)

`session-manager.test.ts`, `session-manager.stop-task.test.ts`, `session-manager-images-fast.test.ts`,
`group-d-permission-rich.test.ts`, `group-d-mcp-endpoints.test.ts`, `mcp-write-endpoints.test.ts`,
`routes-settings.test.ts` all use `vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: ... }))`
— they replace the whole module with a stub, so they do not depend on SDK internal type shapes.
`routes-discovery.test.ts` / `routes-rewind.test.ts` use `as unknown as import("…").Query` to fabricate
a partial `Query` — only at-risk if the *names* of the Query methods they stub change.

---

## Changelog deltas for the target range (0.3.143 → 0.3.156)

Source: published agent-sdk changelog highlights (WebSearch, 2026-05-29). The following are the documented
breaking/notable items in range and their impact here:

1. **BREAKING — removed v2 session API** (`unstable_v2_createSession`, `unstable_v2_resumeSession`,
   `unstable_v2_prompt`, `SDKSession`, `SDKSessionOptions`), deprecated since 0.2.133.
   → **No impact.** `rg "unstable_v2|SDKSession\b|SDKSessionOptions"` → no matches. We use the *retained*
   `query()` function API and the *message* type `SDKSessionStateChangedMessage` (sdk.d.ts:3429, still in the
   `SDKMessage` union at sdk.d.ts:3175).

2. **BREAKING — headless/SDK sessions use Task tools (`TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList`) instead
   of `TodoWrite`**, deprecated since 0.2.136.
   → **Already handled.** `analyzer/metrics.ts:59-66` parses TaskCreate/TaskUpdate AND TodoWrite. New SDK
   sessions will emit Task tools; historical JSONL still has TodoWrite. Both paths covered.

3. **BREAKING-ish — MCP servers connect in the background by default**; init reports `status: "pending"` until
   ready (`MCP_CONNECTION_NONBLOCKING=0` restores old behavior).
   → **No impact.** `pending` is already a member of `McpServerStatus["status"]` (the doc comment at
   session-manager.ts:16 lists `connected|failed|needs-auth|pending|disabled`), and `ExtendedMcpServerStatus`
   only *adds* `"configured"`. Dashboard already renders the live union.

4. **Additive — optional `terminal_reason` field on result messages.**
   → **No impact, optional opportunity.** `mapSdkMessageToSSEEvents` result branch (sse-event-handler.ts:767-801)
   reads result fields defensively; it could forward `terminal_reason` similarly to the existing `stop_reason`
   handling, but nothing breaks if it doesn't.

5. **Additive — `resolveSettings()` (alpha).** Not used. No impact.

6. **Fixes — CJK/multibyte corruption, MCP child-process cleanup on `query()` end.** Pure fixes; benefit us
   (we stream multibyte text deltas through SSE). No code change required.

---

## Coupling: agent SDK deep-imports from `@anthropic-ai/sdk`

`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` lines 1-8 import **types** from `@anthropic-ai/sdk`
**deep subpaths**:

```
import type { BetaMessage }               from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { BetaUsage }                 from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { MessageParam }              from '@anthropic-ai/sdk/resources';
```

Peer dependency: `@anthropic-ai/sdk: ">=0.93.0"` (agent-sdk package.json). 0.100.1 satisfies it.
All four symbols + subpaths exist in the current 0.96 install (verified: 3 beta symbols present,
`MessageParam` exported from `/resources`). **Risk:** if 0.100.1 moves/renames any of these four symbols or
changes the `/resources/beta/messages/messages.mjs` subpath, the agent SDK's own `.d.ts` fails to resolve →
compile break in *our* tree even though we never import these types directly. Because both packages bump
together and agent-sdk 0.3.156 is the version published to pair with current `@anthropic-ai/sdk`, this is
expected to be safe — but it is the single most important thing to verify with `tsc --noEmit` post-bump.

---

## Lockfile / pinning findings

- `server/package.json`: `@anthropic-ai/claude-agent-sdk: ^0.3.143`, `@anthropic-ai/sdk: ^0.96.0` (caret).
- root `package.json`: `@anthropic-ai/claude-agent-sdk: ^0.3.143` (no direct `@anthropic-ai/sdk`).
- Caret pinning means `pnpm install` could already float within `0.3.x` / `0.96.x→0.x`. The bump should set
  exact targets and regenerate locks.
- **Root `pnpm-lock.yaml`** resolves agent-sdk against `@anthropic-ai/sdk@0.96.0` (authoritative monorepo lock).
- **`server/pnpm-lock.yaml` is STALE / out of sync:** its importers section lists NO direct `@anthropic-ai/sdk`
  dependency (despite `server/package.json` declaring `^0.96.0`), and it resolves the agent-sdk peer against
  `@anthropic-ai/sdk@0.81.0` + `@modelcontextprotocol/sdk@1.27.1` (root lock uses 1.29.0). A standalone
  `pnpm install` inside `server/` would not reproduce the root environment. Regenerate both locks during the bump.
- Native binary coupling: agent-sdk ships platform-specific optionalDependencies pinned to its EXACT version
  (`@anthropic-ai/claude-agent-sdk-darwin-arm64@0.3.143`, …). Bumping the agent-sdk pulls 8 new exact-version
  native packages — ensure the lock captures all platform variants for CI/release matrices.

---

## Adaptation tasks (one per at-risk site)

See structured findings. Each carries `file:line`, `rootCause`, `proposedFix`, `severity` (= breakage risk),
and `confidence`. The dominant recommended action is a **single verification gate**:
`cd server && npx tsc --noEmit && pnpm -C server test` after bumping both deps and regenerating both lockfiles.
If `tsc` is green, every type-only and Query-method site is proven compatible (TypeScript would surface any
signature/shape change as an error — except where the casts below suppress it).

### Casts that would HIDE a break (audit manually even if tsc is green)

- `session-manager.ts:261` — `permissionMode as unknown as SdkPermissionMode`
- `session-manager.ts:389` — same cast in `setPermissionMode`
- `session-manager.ts:78` — `config as ExtendedMcpServerStatus["config"]` (McpServerStatusConfig union cast)
- `session-manager.ts:274-275` — `(options as Record<string, unknown>).blockedPath/.decisionReason` reads
- `sse-event-handler.ts:399-409` — `mapSdkMessageToSSEEvents` param typed as `any`-bag (intentional, but means
  message-shape changes are invisible to the compiler; relies on runtime `??`/`typeof` guards)
- `routes-discovery.test.ts` / `routes-rewind.test.ts` — `as unknown as import("…").Query` fabricated stubs

These `as unknown as` / `as` casts mean a renamed enum value, a changed `Options` field name, or a moved
Query method could compile clean and fail only at runtime. Post-bump, re-read these six sites against the new
`sdk.d.ts` (the `'auto'`/`'dontAsk'` `PermissionMode` members at sdk.d.ts:1865 in particular).
