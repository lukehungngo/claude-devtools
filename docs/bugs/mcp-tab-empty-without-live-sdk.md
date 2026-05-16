# Bug: MCP tab shows "No MCP servers configured" for any session not started from the dashboard

**Severity:** P1 — confirmed user-visible loss of information (configured MCP servers invisible)
**Filed:** 2026-05-17
**Reported version:** v0.3.12 (and every prior version since the MCP tab was added)
**Reporter symptom:** "Open MCP tab for a CLI-launched session — it says 'No MCP servers configured.' even though my project has a `.mcp.json` with a server defined."

## Symptom (verified empirically)

Project `/Users/soh/working/ai/claude-devtools` has a project-level `.mcp.json`:

```jsonc
{
  "mcpServers": {
    "claude-devtools": {
      "type": "http",
      "url": "http://localhost:5557/mcp"
    }
  }
}
```

For any historical (cold) session — i.e. a session not started from the dashboard's web UI — the MCP API returns null:

```bash
$ curl -s http://localhost:5557/api/sessions/<historical-session-id>/mcp-status
{"servers":null}
```

The dashboard treats `{servers: null}` the same as `{servers: []}` and renders:

> **No MCP servers configured.**

`dashboard/src/components/bottom-panel/MCPStatusTab.tsx:107-115` — empty-state branch fires for `servers.length === 0`, which is true for `null` after the `Array.isArray()` guard.

Only sessions started from the dashboard's SSE path (`POST /api/sessions/start` + `sendMessage`) ever populate an `activeQuery` on the `SessionManager`, so 100% of CLI-launched sessions hit the null branch.

## Root cause

`server/src/session/session-manager.ts:627-636` (original):

```ts
async getMcpServerStatus(sessionId: string): Promise<McpServerStatus[] | null> {
  const session = this.activeSessions.get(sessionId);
  if (!session?.activeQuery) return null;          // ← bails out for any cold session
  try {
    return await session.activeQuery.mcpServerStatus();
  } catch (err) {
    sessionLog.warn({ sessionId, err: String(err) }, "mcpServerStatus failed");
    return null;
  }
}
```

The implementation only knew how to call the **live** SDK method `query.mcpServerStatus()`, which requires an active in-process `Query` object. Cold (CLI-launched) sessions have no in-process query — their `activeSessions` entry either doesn't exist or has `activeQuery === undefined`. The function returned null in that case, blanking the dashboard.

The fix path Claude Code itself uses for the same surface is config-file resolution on disk: it reads `.mcp.json`, `.claude/settings.json`, `.claude/settings.local.json`, the user-level `~/.claude/settings.json`, and the legacy `~/.claude/mcp_servers.json`. The dashboard had none of that fallback.

## Fix

### Server — `server/src/session/session-manager.ts`

Add a disk-fallback reader and use it whenever `activeQuery` is absent.

```diff
+/** Bug F — widened MCP status type. */
+export type ExtendedMcpServerStatus =
+  Omit<McpServerStatus, "status"> & { status: McpServerStatus["status"] | "configured" };
+
+function readMcpServersFromDisk(cwd: string): ExtendedMcpServerStatus[] {
+  const sources = [
+    { file: join(cwd, ".mcp.json"),                          scope: "project", key: "root" },
+    { file: join(cwd, ".claude", "settings.json"),           scope: "project", key: "mcpServers" },
+    { file: join(cwd, ".claude", "settings.local.json"),     scope: "local",   key: "mcpServers" },
+    { file: join(homedir(), ".claude", "settings.json"),     scope: "user",    key: "mcpServers" },
+    { file: join(homedir(), ".claude", "mcp_servers.json"),  scope: "user",    key: "root" },
+  ];
+  const merged = new Map<string, ExtendedMcpServerStatus>();
+  for (const { file, scope, key } of sources) {
+    if (!existsSync(file)) continue;
+    let parsed: unknown;
+    try { parsed = JSON.parse(readFileSync(file, "utf-8")); }
+    catch (err) { sessionLog.warn({ file, err: String(err) }, "..."); continue; }
+    // Extract mcpServers based on shape ...
+    // First-write-wins per name → project > local > user precedence.
+  }
+  return Array.from(merged.values());
+}
+
 async getMcpServerStatus(sessionId: string)
-  : Promise<McpServerStatus[] | null>
+  : Promise<ExtendedMcpServerStatus[] | null>
 {
   const session = this.activeSessions.get(sessionId);
-  if (!session?.activeQuery) return null;
-  try { return await session.activeQuery.mcpServerStatus(); }
-  catch (err) { sessionLog.warn(...); return null; }
+  if (session?.activeQuery) {
+    try { return await session.activeQuery.mcpServerStatus(); }
+    catch (err) { sessionLog.warn(...); return null; }
+  }
+  // Bug F — cold-session fallback to disk.
+  const info = discoverSessions().find((s) => s.id === sessionId);
+  if (!info?.cwd) return null;
+  return readMcpServersFromDisk(info.cwd);
 }
```

### Config-file resolution order

Matches what Claude Code itself reads. Project-level wins over user-level; within a tier, first source wins on name conflict.

| # | Path                                          | Scope     | Shape                          |
|---|-----------------------------------------------|-----------|--------------------------------|
| 1 | `<session.cwd>/.mcp.json`                     | `project` | `{ mcpServers: { ... } }`      |
| 2 | `<session.cwd>/.claude/settings.json`         | `project` | `{ mcpServers: { ... }, ... }` |
| 3 | `<session.cwd>/.claude/settings.local.json`   | `local`   | `{ mcpServers: { ... }, ... }` |
| 4 | `~/.claude/settings.json`                     | `user`    | `{ mcpServers: { ... }, ... }` |
| 5 | `~/.claude/mcp_servers.json` (legacy)         | `user`    | `{ ... }` (root is server map) |

Each file is wrapped in `try/catch` per architecture invariant #3 (fail-safe parsing). Missing or malformed files are logged via `sessionLog.warn` and skipped — never crash the response.

Each entry is surfaced as:

```ts
{
  name: <key>,
  status: "configured",          // new value, not a live SDK status
  scope: "project" | "local" | "user",
  config: { type?, url?, command?, args? },  // pass-through for transport display
}
```

### Client — `dashboard/src/components/bottom-panel/MCPStatusTab.tsx`

1. Widen `McpStatus` to include `"configured"`.
2. Add a `StatusIcon` case for `configured` using `lucide-react`'s `Settings` icon with `var(--t3)` grey. Test id: `mcp-icon-configured`.
3. When any row has `status === "configured"`, render a small footer banner below the list:

   > Live connection status only available for sessions started from the dashboard. Showing configured servers from .mcp.json and settings files.

   Test id: `mcp-cold-session-banner`. Styling: `mt-2 mx-3 px-3 py-2`, grey foreground, faint background.

4. Extend `formatTransport()` to render `stdio · <command>` when only `command` is present (no `type` field).

## Tests added

### Server — `server/src/session/session-manager.test.ts`

Six new specs under `describe("SessionManager.getMcpServerStatus — disk fallback (Bug F)")`:

| Test name                                                                                   | Asserts |
|---------------------------------------------------------------------------------------------|---------|
| `reads servers from <cwd>/.mcp.json when session has no activeQuery`                        | 2 servers from project-level `.mcp.json`, both `status: "configured"`, `scope: "project"`, transport fields preserved |
| `merges servers from <cwd>/.claude/settings.json with project precedence`                   | project `.mcp.json` ("a") + project `settings.json` ("b") → both returned |
| `project .mcp.json wins on name conflict with .claude/settings.local.json`                  | Same name in both files → project-tier config wins |
| `skips malformed .mcp.json without crashing`                                                | Returns `[]`, no throw |
| `returns null when session has no cwd in discovery`                                         | SessionInfo without cwd → null |
| `returns null when session not found in discovery and no activeQuery`                       | Truly unknown session → null |

One existing spec updated to match new behavior:

| Test name (before)                                                  | Behavior (after) |
|---------------------------------------------------------------------|------------------|
| `returns null when session has no activeQuery (not live)`           | Renamed → `returns empty list when session has no activeQuery and no on-disk MCP config (Bug F fallback)` — now asserts `[]` with an empty tmp cwd |

User-level (`~/.claude/settings.json`) tests are scoped out per spec — mocking `homedir()` is out of scope. Project-level coverage is sufficient and the user-tier code path is straight-line.

### Client — `dashboard/src/components/bottom-panel/MCPStatusTab.test.tsx`

Two new specs:

| Test name | Asserts |
|-----------|---------|
| `renders the configured-icon and a footer banner for cold-session 'configured' rows` | Two `mcp-icon-configured` icons render; banner text "Live connection status only available for sessions started from the dashboard" appears |
| `does NOT render the cold-session banner when all rows are live statuses`            | With only `status: "connected"` rows, banner is absent |

## Both-directions verification

**Server (TDD RED → GREEN):**
- Before implementing: 5 of the 6 new disk-fallback tests failed with `expected null not to be null` and `expected null to deeply equal []`.
- After implementing `readMcpServersFromDisk()` + cold-session branch: 59 / 59 tests pass in `session-manager.test.ts` (54 existing + 5 new specs; one prior spec rewritten in place).

**Client (TDD RED → GREEN):**
- Before implementing: the new `renders the configured-icon and a footer banner` spec failed at `getAllByTestId("mcp-icon-configured")` — DOM fell through to the unknown-status icon.
- After widening `McpStatus`, adding the `Settings`-icon `StatusIcon` case, and rendering the banner conditional: 12 / 12 tests pass in `MCPStatusTab.test.tsx` (10 existing + 2 new specs).

**Full regression:**
- Server: 774 passed, 31 skipped, 0 failures.
- Dashboard: 1624 passed, 4 skipped, 1 pre-existing failure (`useInsightsAggregate.test.ts:121` — verified failing on clean `master` before any Bug F edits; unrelated to MCP surface).
- Typecheck: `npx tsc --noEmit` clean in both `server/` and `dashboard/`.
- Lint on all four modified files: clean (no new warnings/errors).

## Related

- Architecture invariant #1: "JSONL is source of truth — read-only from `~/.claude/projects/`." The MCP config files live alongside the project, not in `~/.claude/projects/`, but the same read-only fail-safe parsing discipline applies — every config read is wrapped in `try/catch` and logs via `sessionLog.warn` instead of throwing.
- Architecture invariant #3: "Skip malformed lines, never crash." Applied to JSON config files too — invalid `.mcp.json` is logged and skipped.
- SDK reference: `McpServerStatus` in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:986`. The fallback type `ExtendedMcpServerStatus` widens the `status` field only; `name`, `scope`, and `config` keep their original shapes so the existing dashboard renderer needs no per-field changes.
