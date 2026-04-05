# Command Discovery — Slash Commands in Dashboard

How the dashboard discovers and displays slash commands, and the architectural gap with the CLI.

---

## CLI Command Sources

Claude Code CLI has **4 command sources**, each contributing different commands:

| Source | Example | Count | Dynamic? |
|--------|---------|-------|----------|
| **Built-in** | `/help`, `/compact`, `/model`, `/clear` | ~31 | No |
| **Skills** (`.claude/skills/`) | `/commit`, `/review-pr`, `/tdd` | Varies per project | Yes |
| **Plugins** (marketplace + local) | `/everything-claude-code:loop-start` | Varies per user | Yes |
| **MCP tools** | Tool-generated commands | Varies per session | Yes |

The CLI knows **all** of these because they're registered in-process. The SDK exposes them via:

```typescript
// SDK type: SlashCommand
type SlashCommand = {
  name: string;         // Without leading "/"
  description: string;
  argumentHint: string; // e.g., "<file>" or ""
};

// On Query object:
query.supportedCommands(): Promise<SlashCommand[]>

// Also in init response:
SDKControlInitializeResponse.commands: SlashCommand[]
```

---

## Dashboard Command Discovery Architecture

### 4-Tier Fallback (Server-Side)

```
┌─────────────────────────────────────────────────────┐
│ Tier 1: SDK Live Query                              │
│ query.supportedCommands()                           │
│ Returns ALL commands (built-in + skills + plugins)  │
│ Only available when activeQuery exists               │
├─────────────────────────────────────────────────────┤
│ Tier 2: Per-Session Cache                           │
│ session.cachedCommands                              │
│ Preserved from last successful SDK query            │
│ Available after activeQuery is cleared (idle)       │
├─────────────────────────────────────────────────────┤
│ Tier 3: Global Cache (CommandCache)                 │
│ Disk-persisted at ~/.claude/devtools/command-cache  │
│ Populated by:                                       │
│   a) Any session's SDK query (Tier 1 success)      │
│   b) Filesystem scan on server startup              │
│   c) CLI spawn fallback (if scan finds nothing)     │
│ Includes skills + plugins discovered from disk      │
├─────────────────────────────────────────────────────┤
│ Tier 4: Static Fallback                             │
│ FALLBACK_COMMANDS (31 built-in commands)            │
│ Used when no cache exists and no SDK available      │
│ MISSING: skills, plugins, marketplace commands      │
└─────────────────────────────────────────────────────┘
```

### Filesystem Scan (Bootstrap)

On server startup, `CommandCache.bootstrap()` scans the filesystem to populate the global cache **before** any SDK query is available. This runs in a non-blocking `setTimeout(500ms)`.

**Scan sources:**

| Source | Path | Pattern |
|--------|------|---------|
| User skills | `~/.claude/skills/` | `<name>/SKILL.md` — YAML frontmatter `name:` + `description:` |
| Plugin commands | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/commands/` | `<name>.md` — prefixed as `plugin:name` |
| Plugin skills | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/` | `<name>/SKILL.md` — prefixed as `plugin:name` |

**Plugin discovery:** Reads `~/.claude/plugins/installed_plugins.json` registry to find install paths, then reads `plugin.json` for the plugin name.

**Fallback chain within bootstrap:**
1. Filesystem scan (`scanSkillsFromFilesystem()`) — fast, <100ms
2. CLI spawn (`claude --print -p "/help"`) — slow, 15s timeout, only if scan returns 0 results

**Key files:**
- `server/src/discovery/skill-scanner.ts` — filesystem scanning logic
- `server/src/discovery/command-cache.ts` — cache + bootstrap orchestration

### Data Flow

```
Server (discovery-routes.ts)              Client (useDiscovery.ts)
───────────────────────────               ─────────────────────────
GET /sessions/:id/commands                useDiscoveryCommands(sessionId)
  │                                         │
  ├─ activeQuery?.supportedCommands()       ├─ sessionId exists?
  │   → {commands, source: "sdk"}           │   YES → fetch from server
  │                                         │   NO  → CLIENT_FALLBACK + DASHBOARD_ONLY
  ├─ session.cachedCommands?                │
  │   → {commands, source: "cached"}        ├─ Server returned commands?
  │                                         │   YES → merge with DASHBOARD_ONLY
  ├─ commandCache.get()?                    │   NO  → keep CLIENT_FALLBACK + DASHBOARD_ONLY
  │   → {commands, source: "global-cache"}  │
  │                                         └─ Retry if source !== "sdk"|"cached"
  └─ FALLBACK_COMMANDS (31)                     (up to 5x, every 3s)
      → {commands, source: "fallback"}

GET /commands (no session required)
  └─ commandCache.get() ?? FALLBACK_COMMANDS
      → {commands, source: "global-cache"|"fallback"}
```

### Dashboard-Only Commands

These 5 commands exist only in the web dashboard (not in CLI):

| Command | Description |
|---------|-------------|
| `/copy` | Copy last assistant response(s) to clipboard |
| `/export` | Export conversation (md \| json) |
| `/analytics` | Show cross-session analytics |
| `/shortcuts` | Show keyboard shortcuts |
| `/exit` | Exit the current session |

They are **always merged** client-side via `mergeWithDashboardCommands()`, deduplicating by name.

---

## The Gap: Why Dashboard Shows Fewer Commands

### When all commands are visible (Tier 1)

A web-started session with an active SDK query returns the **complete** command list — identical to the CLI. This includes skills, plugins, and marketplace commands.

### When commands are limited (Tier 3)

| Scenario | What happens | Commands shown |
|----------|-------------|----------------|
| No session selected | Client fallback | 31 built-in + 5 dashboard-only |
| CLI-started session (viewing history) | No activeQuery | Cached or 31 built-in |
| Web session, SDK not yet ready | Fallback with retry | 31 built-in (retries for SDK) |
| Web session, activeQuery ready | SDK live query | **ALL** commands |
| Fetch error | Client fallback | 31 built-in + 5 dashboard-only |

### Missing in fallback

The fallback list cannot include:
- **Skills**: Vary per project (`.claude/skills/`, plugin skills)
- **Plugins**: Vary per user (marketplace installs, `--plugin-dir`)
- **MCP commands**: Vary per session (MCP server config)
- **Custom agents**: Vary per session (`--agents` flag)

These are dynamic and only known to the SDK at runtime.

---

## Key Files

| File | Role |
|------|------|
| `server/src/http/routes/discovery-routes.ts` | Server endpoint, 4-tier resolution |
| `server/src/discovery/command-cache.ts` | Global cache with disk persistence + bootstrap |
| `server/src/discovery/skill-scanner.ts` | Filesystem scanner for skills + plugins |
| `dashboard/src/hooks/useDiscovery.ts` | Client hook, fetch + merge + retry |
| `dashboard/src/lib/slashCommandHandler.ts` | Command execution + dynamic `/help` |
| `dashboard/src/components/conversation/PromptInput.tsx` | Autocomplete UI |

---

## SDK Type Reference

From `@anthropic-ai/claude-agent-sdk` sdk.d.ts:

```typescript
// SlashCommand (line 3690)
type SlashCommand = {
  name: string;        // Skill name without leading "/"
  description: string; // What the skill does
  argumentHint: string; // e.g., "<file>" or ""
};

// Query method (line 1498)
query.supportedCommands(): Promise<SlashCommand[]>;

// Init response (line 1804)
type SDKControlInitializeResponse = {
  commands: SlashCommand[];
  agents: AgentInfo[];
  models: ModelInfo[];
  // ...
};
```

---

## Improvement Opportunities

1. ~~**Persist SDK commands to disk**~~ — ✅ Implemented. `CommandCache` writes to `~/.claude/devtools/command-cache.json` on every SDK success.

2. ~~**Query CLI directly**~~ — ✅ Implemented as fallback in `CommandCache.bootstrap()`. Spawns `claude --print -p "/help"` with 15s timeout, but only when filesystem scan returns nothing.

3. **Use init response** — `SDKControlInitializeResponse.commands` is returned on session start. Cache this alongside session metadata.

4. ~~**Skill/plugin file scanning**~~ — ✅ Implemented. `scanSkillsFromFilesystem()` reads `~/.claude/skills/` and plugin install paths from `~/.claude/plugins/installed_plugins.json`. Runs on server startup (<100ms).

5. **MCP command discovery** — MCP-provided commands are only available via live SDK query. Consider scanning MCP server configs to infer available tools.
