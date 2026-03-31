# Configuration System

All config file formats, locations, and structures.

---

## File Locations

### 3-Level Hierarchy (lowest to highest priority)

| Level | Location | Scope |
|-------|----------|-------|
| User | `~/.claude/settings.json` | All projects |
| Project | `{project}/.claude/settings.json` | This project |
| Local | `{project}/.claude/settings.local.json` | This checkout (gitignored) |

### Enterprise (Managed)

| Platform | Path |
|----------|------|
| Linux | `/etc/claude-code/settings.json` |
| macOS | `~/Library/Application Support/ClaudeCode/settings.json` |

---

## settings.json Structure

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",

  "model": "claude-opus-4-6",
  "effort": "high",

  "permissions": {
    "allow": ["Read(*)", "Glob(*)", "Grep(*)"],
    "deny": ["Bash(rm -rf *)"],
    "ask": ["Write(*)"],
    "defaultMode": "default",
    "additionalDirectories": ["/shared/libs"]
  },

  "env": {
    "SOME_VAR": "value"
  },

  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "echo checking...", "timeout": 30 },
          { "type": "prompt", "prompt": "Check if this is safe: $ARGUMENTS" },
          { "type": "agent", "prompt": "Verify tests pass" }
        ]
      }
    ],
    "PostToolUse": [...],
    "UserPromptSubmit": [...],
    "SessionStart": [...],
    "SessionEnd": [...]
  },

  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

---

## Hooks Configuration

### 22 Hook Events

| Event | When Fired |
|-------|-----------|
| `PreToolUse` | Before a tool executes |
| `PostToolUse` | After successful tool execution |
| `PostToolUseFailure` | After failed tool execution |
| `Notification` | System notification |
| `UserPromptSubmit` | User submits a prompt |
| `SessionStart` | Session begins |
| `SessionEnd` | Session ends |
| `Stop` | Generation stops |
| `StopFailure` | Stop attempt fails |
| `SubagentStart` | Subagent spawned |
| `SubagentStop` | Subagent completed |
| `PreCompact` | Before context compaction |
| `PostCompact` | After context compaction |
| `PermissionRequest` | Permission decision needed |
| `Setup` | First-time setup |
| `TeammateIdle` | Teammate agent idle |
| `TaskCompleted` | Background task completed |
| `Elicitation` | MCP elicitation started |
| `ElicitationResult` | MCP elicitation completed |
| `ConfigChange` | Configuration changed |
| `WorktreeCreate` | Git worktree created |
| `WorktreeRemove` | Git worktree removed |
| `InstructionsLoaded` | CLAUDE.md loaded |

### Hook Types

**Command hook:**
```json
{ "type": "command", "command": "npm test", "timeout": 60 }
```

**HTTP hook:**
```json
{ "type": "http", "url": "https://webhook.example.com/validate", "timeout": 10 }
```

**Prompt hook (Claude evaluates):**
```json
{ "type": "prompt", "prompt": "Is this bash command safe? $ARGUMENTS" }
```

**Agent hook (subagent verifies):**
```json
{ "type": "agent", "prompt": "Run security checks on the proposed changes" }
```

### Hook Matcher

```json
{
  "matcher": "Bash",          // Tool name to match (or regex)
  "hooks": [...]              // Array of hooks to run
}
```

### Hook I/O

Hooks receive JSON on stdin and output JSON on stdout:

**Input (PreToolUse):**
```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /" },
  "session_id": "...",
  "agent_id": "..."
}
```

**Output:**
```json
{
  "decision": "allow" | "deny" | "block",
  "reason": "Dangerous command detected",
  "modified_input": { "command": "echo 'blocked'" }
}
```

Exit codes: 0 = allow, 1 = deny/block, 2+ = error (logged, continues).

---

## MCP Configuration

### Project-level (.mcp.json)

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["./server.js"],
      "env": { "API_KEY": "..." },
      "disabled": false
    }
  }
}
```

### Server Types

| Type | Config | Use Case |
|------|--------|----------|
| `stdio` | `command` + `args` | Local process (most common) |
| `http` | `url` | Remote HTTP server |
| `sse` | `url` | Server-Sent Events (deprecated) |
| `sdk` | In-process | SDK-created MCP server |

### MCP Tool Naming

Tools from MCP servers are named: `mcp__[server-name]__[tool-name]`

Example: `mcp__github__create_issue`

---

## CLAUDE.md Memory System

### File Hierarchy (7 tiers, highest to lowest)

| Tier | Path | Scope |
|------|------|-------|
| 1 | Managed policy | Enterprise-controlled |
| 2 | `{project}/CLAUDE.md` or `{project}/.claude/CLAUDE.md` | Project |
| 3 | `{project}/.claude/rules/*.md` | Project rules |
| 4 | `{project}/.claude/agents/{name}/CLAUDE.md` | Agent-specific |
| 5 | `~/.claude/CLAUDE.md` | User global |
| 6 | Subdirectory `CLAUDE.md` files | Directory-scoped |
| 7 | `~/.claude/memory/` | Auto-learned |

### Quick-Save Syntax

In conversation: `# Always use TypeScript strict mode` → auto-saved to memory tier 7.

### Commands

- `/memory` — view/edit memory
- `/init` — create scaffold CLAUDE.md
- `# rule` — quick-save to auto-memory

---

## Keyboard Shortcuts (CLI)

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Cancel current generation |
| `Shift+Tab` | Cycle permission modes |
| `Esc+Esc` | Rewind menu (checkpoint) |
| `Alt+P` | Switch model |
| `Alt+T` | Toggle extended thinking |
| `Alt+O` | Toggle fast mode |
| `Ctrl+B` | Background tasks |
| `Ctrl+T` | Task list |
| `Ctrl+L` | Clear screen |
| `Ctrl+R` | Reverse search history |
| `Tab` | Autocomplete |
| `Up/Down` | Command history |

---

## CLI Flags (Most Important)

| Flag | Type | Description |
|------|------|-------------|
| `-p`, `--print` | — | Non-interactive print mode |
| `-c`, `--continue` | — | Continue most recent session |
| `-r`, `--resume` | `string` | Resume named session |
| `-w`, `--worktree` | — | Use git worktree isolation |
| `--model` | `string` | Model selection |
| `--effort` | `string` | Effort level |
| `--permission-mode` | `string` | Permission mode |
| `--tools` | `string` | Comma-separated tool list |
| `--max-turns` | `number` | Max turns |
| `--max-budget-usd` | `number` | Budget cap |
| `--system-prompt` | `string` | Override system prompt |
| `--output-format` | `string` | text/json/stream-json |
| `--json-schema` | `string` | Structured output schema |
| `--verbose` | — | Debug logging |
| `--remote` | — | Enable WebSocket remote control |
| `--dangerously-skip-permissions` | — | Skip all permission checks |
