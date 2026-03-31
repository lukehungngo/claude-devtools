# Claude Code Architecture — 8 Core Systems

Claude Code is not just a chat CLI. It's **8 interconnected extensibility systems** built around a conversation engine. Understanding this architecture is essential for building a web client that can replace it.

---

## System Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code CLI                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Commands  │  │ Skills   │  │ Agents   │  │ Plugins      │   │
│  │ (manual)  │  │ (auto)   │  │ (isolate)│  │ (bundle)     │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │           │
│  ┌────▼──────────────▼──────────────▼───────────────▼────────┐ │
│  │              Conversation Engine (SDK query())             │ │
│  │  prompt → streaming → tool calls → permissions → result   │ │
│  └───┬──────────┬──────────┬──────────┬─────────────┬────────┘ │
│      │          │          │          │             │           │
│  ┌───▼───┐  ┌──▼───┐  ┌──▼──────┐  ┌▼──────────┐ ┌▼────────┐ │
│  │Memory │  │Hooks │  │MCP      │  │Permissions│ │Checkpts │ │
│  │(ctx)  │  │(auto)│  │(extern) │  │(security) │ │(rewind) │ │
│  └───────┘  └──────┘  └─────────┘  └───────────┘ └─────────┘ │
│                                                                 │
│  All state persisted to: ~/.claude/projects/{hash}/{sid}.jsonl  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Commands & Skills (Unified System)

**What:** Slash commands and skills are now a **unified system**. Both create `/slash-command` interfaces. ~35-40 built-in commands + 4 bundled skills + unlimited custom.
**Storage:** `.claude/commands/` (project) or `~/.claude/commands/` (user)
**Format:** Markdown files with YAML frontmatter

```yaml
---
name: review-pr
description: Review a pull request
allowed-tools: Read, Glob, Grep
---
Review PR #$ARGUMENTS using the project's coding standards in CLAUDE.md.
Focus on: security, performance, correctness.
```

**Key properties:**
- `disable-model-invocation` — user-only, Claude can't trigger
- `allowed-tools` — restrict which tools the command can use
- `user-invocable` — whether it appears in / autocomplete
- Supports shell execution (backticks), variable substitution (`$ARGUMENTS`), file includes (`@filename`)

**Our status:** 27 commands implemented in PromptInput.tsx. Most are client-side formatters, not real SDK command invocations.

---

## 2. Memory (CLAUDE.md System)

**What:** Persistent context loaded every session. Project rules, coding standards, team knowledge.
**Format:** Markdown files at specific paths

**7-tier hierarchy (highest to lowest priority):**

| Tier | Source | Path |
|------|--------|------|
| 1 | Managed Policy | `/etc/claude-code/settings.json` (enterprise) |
| 2 | Project instructions | `{project}/CLAUDE.md` or `{project}/.claude/CLAUDE.md` |
| 3 | Project rules | `{project}/.claude/rules/*.md` |
| 4 | Agent-specific | `{project}/.claude/agents/{name}/CLAUDE.md` |
| 5 | User global | `~/.claude/CLAUDE.md` |
| 6 | Directory-scoped | Subdirectory `CLAUDE.md` files |
| 7 | Auto-learned | `~/.claude/memory/` (from `#` prefix quick-save) |

**Update methods:**
- Direct file edit
- `# rule here` quick syntax (auto-saved to memory)
- `/memory` command (view/edit)
- `/init` command (scaffold new CLAUDE.md)

**Our status:** Read-only viewer (MemoryEditor.tsx). Can't edit. No tier hierarchy awareness. /init creates a scaffold but doesn't use SDK.

---

## 3. Skills

**What:** Reusable, auto-invoked capabilities. Like commands but Claude can trigger them automatically.
**Storage:** `.claude/skills/{skill-name}/SKILL.md` + optional templates/examples/scripts
**Loading:** Progressive disclosure — metadata always loaded, instructions only when triggered, resources as needed

```yaml
---
name: code-review
description: Automated code review with style checking
allowed-tools: Read, Glob, Grep
---
When reviewing code:
1. Check against project standards in CLAUDE.md
2. Run linting via Bash
3. Report issues by severity
```

**Invocation modes:**
- Default: both user and Claude can invoke
- `disable-model-invocation: true`: user-only
- `user-invocable: false`: Claude-only (background knowledge)

**Bundled skills (ship with Claude Code):**
- `/simplify` — Reviews changed files, spawns 3 review agents
- `/batch` — Orchestrates parallel codebase changes
- `/review` — PR review
- `/loop` — Runs prompt on repeating interval

**Our status:** Commands partially built (27 of ~40). Skills system NOT BUILT. Bundled skills not exposed.

---

## Additional Systems (Not in Original 8)

### Output Styles
**Storage:** `~/.claude/output-styles/` and `.claude/output-styles/`
**Format:** Markdown with frontmatter, appended to system prompt
**Built-in:** Default, Explanatory, Learning
**Command:** `/output-style`, `/output-style:new`
**Our status:** NOT BUILT.

### Keybindings
**Storage:** `~/.claude/keybindings.json`
**Features:** Context-based bindings, chord sequences, auto-reload
**Command:** `/keybindings`
**Our status:** NOT BUILT. We have hardcoded shortcuts in useKeyboardShortcuts.ts.

---

## 4. Subagents

**What:** Specialized AI assistants with isolated context windows. Prevents context pollution.
**Storage:** `.claude/agents/{name}/CLAUDE.md`
**Architecture:** Each agent gets its own JSONL file, restricted tool access, custom system prompt

**Built-in agent types:**
- `Explore` — codebase exploration
- `Plan` — architecture planning
- `general-purpose` — broad tasks

**Key properties:**
- Isolated context (own conversation history)
- Configurable tool restrictions
- Background execution support
- Git worktree isolation
- Resumable sessions
- Chainable (agents can spawn agents)

**Disk format:**
```
~/.claude/projects/{hash}/{sessionId}/subagents/
  agent-{agentId}.jsonl        # Agent's conversation
  agent-{agentId}.meta.json    # { agentType, description }
```

**Our status:** DAG visualization (excellent), event viewer (good). No agent management/configuration from web UI. No ability to define custom agents.

---

## 5. MCP (Model Context Protocol)

**What:** Real-time access to external tools, APIs, databases. Dynamic data, not static context.
**Config:** `.mcp.json` (project), `~/.claude.json` (user), `.claude.json` (local)

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

**Transport types:** stdio, http, sse (deprecated), sdk (in-process)
**Tool naming:** `mcp__[server]__[action]` (e.g., `mcp__github__create_issue`)

**SDK methods for MCP management:**
- `query.mcpServerStatus()` — get server health
- `query.reconnectMcpServer(name)` — reconnect a server
- `query.toggleMcpServer(name, enabled)` — enable/disable
- `query.setMcpServers(servers)` — reconfigure

**Our status:** Read-only viewer (McpManager.tsx). Reads from settings.json. Cannot add/remove/configure. Don't use SDK's MCP management methods.

---

## 6. Hooks

**What:** Event-driven automation. Scripts that run in response to 22+ system events.
**Storage:** `~/.claude/hooks/` or `settings.json` hooks section

**4 hook types:**
1. **Command** — shell script execution
2. **HTTP** — remote webhook POST
3. **Prompt** — Claude evaluates a prompt to decide
4. **Agent** — subagent runs complex validation

**I/O model:** JSON stdin → processing → JSON stdout + exit code

**22 event types:**
```
PreToolUse, PostToolUse, PostToolUseFailure,
Notification, UserPromptSubmit,
SessionStart, SessionEnd,
Stop, StopFailure,
SubagentStart, SubagentStop,
PreCompact, PostCompact,
PermissionRequest, Setup,
TeammateIdle, TaskCompleted,
Elicitation, ElicitationResult,
ConfigChange,
WorktreeCreate, WorktreeRemove,
InstructionsLoaded
```

**Our status:** Read-only viewer (HookEditor.tsx). Cannot create, edit, or delete hooks. SDK's `hooks` option in `query()` allows passing hook callbacks — we don't use it.

---

## 7. Plugins

**What:** Bundled packages combining commands + agents + skills + hooks + MCP configs.
**Structure:**

```
.claude-plugin/
  plugin.json          # Manifest (name, version, author)
  commands/            # Slash commands
  agents/              # Subagent definitions
  skills/              # Skills
  hooks/               # Hook scripts
  .mcp.json            # MCP server configs
  settings.json        # Plugin settings
  docs/                # Documentation
```

**Distribution:** Marketplace (`claude plugin install`), GitHub, local path

**Our status:** NOT BUILT. No plugin awareness, no plugin management UI.

---

## 8. Checkpoints

**What:** Automatic session snapshots enabling safe experimentation and rewind.
**Frequency:** Created with every user prompt
**Captures:** Messages, file modifications, tool usage, session context

**Access methods:**
- `Esc+Esc` — interactive rewind menu
- `/rewind` command — rewind to specific turn

**5 rewind options:**
1. Restore code AND conversation
2. Restore conversation only
3. Restore code only
4. Summarize forward conversation
5. Cancel

**SDK method:** `query.rewindFiles(userMessageId, { dryRun?: boolean })`
**Retention:** Auto-cleaned after 30 days

**Our status:** /rewind sends text to SDK (passthrough). Don't use `rewindFiles()` SDK method. No checkpoint UI, no rewind options menu, no file restore preview.

---

## System Interactions

```
Commands ──trigger──→ Skills (auto-invoked by Claude during command execution)
Skills ──use──→ MCP (skills can access external data)
Hooks ──validate──→ Tool calls (PreToolUse hooks gate permissions)
Plugins ──bundle──→ Commands + Skills + Hooks + MCP + Agents
Agents ──write──→ Checkpoints (agent work is checkpointed)
Memory ──loaded──→ All sessions (CLAUDE.md always in context)
Checkpoints ──restore──→ Files + Conversation (rewind to any point)
```

---

## Implications for claude-devtools

To truly replace the CLI, we need to support all 8 systems, not just the conversation engine:

| System | Priority | Reason |
|--------|----------|--------|
| Conversation engine | P0 (fix SSE) | Core use case is broken |
| Permissions | P0 (mostly done) | 3/5 modes implemented |
| Memory | P1 | Read-only → needs editing |
| Checkpoints | P1 | Proper rewind via SDK method |
| Hooks | P2 | View → needs management |
| MCP | P2 | View → needs management via SDK methods |
| Commands | P2 | Custom command support |
| Skills | P3 | Discovery and invocation |
| Plugins | P3 | Discovery and management |
| Agents | P3 | Custom agent definitions |
