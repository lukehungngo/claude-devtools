# Gap Matrix — CLI vs claude-devtools

What the CLI has vs what we've built. Updated 2026-03-30 after Phases 0-3 + P1 audit fixes.

---

## Summary

| System | CLI Features | We Have | Status |
|--------|-------------|---------|--------|
| Conversation Engine | Full streaming (text + tools + thinking) | ✅ 20+ SSE event types | Done |
| Commands | 55+ slash commands | 33 commands | ~60% (remaining are low-priority) |
| Memory | 7-tier read/write | ✅ Read + Write | Done |
| Skills | Auto-invoked capabilities | ❌ Not built | Deferred |
| Subagents | Isolated execution + management | ✅ DAG viz + SDK discovery + AgentManager | Done |
| MCP | Full management via SDK | ✅ Status + toggle + reconnect + add | Done |
| Hooks | 22 events, 4 hook types | ✅ Read + Write | Done |
| Plugins | Install/manage/create | ❌ Not built | Deferred |
| Checkpoints | 5 rewind options | ✅ SDK rewindFiles() + dry-run | Done |
| Permissions | 6 modes + rules + UI | ✅ All 6 modes + rules editor | Done |

---

## System 1: Conversation Engine

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| Text streaming | Real-time | ✅ SSE | Done |
| Tool call streaming | Real-time | ✅ tool_start/delta/end SSE | Done |
| Thinking streaming | Real-time | ✅ thinking SSE + StreamingThinking | Done |
| Tool result display | Inline | ✅ tool_result SSE | Done |
| Tool progress | Elapsed timer | ✅ tool_progress SSE | Done |
| Compact progress | Status + before/after | ✅ compact SSE | Done |
| Rate limit events | Displayed | ✅ rate_limit SSE | Done |
| Prompt suggestions | After each turn | ✅ prompt_suggestion SSE | Done |
| Image input | Send images | ✅ Base64 content blocks to SDK | Done |
| Fast mode | Affects query speed | ✅ settings.fastMode to SDK | Done |
| Hook events | Stream display | ✅ hook_started/progress/response SSE | Done |
| Task events | Stream display | ✅ task_started/progress/notification SSE | Done |

## System 2: Commands

| Command | CLI | We Have | Status |
|---------|-----|---------|--------|
| /help | Shows help | ✅ Static help | Done |
| /clear | New session | ✅ Creates new session | Done |
| /compact | SDK compact API | ✅ SDK + progress via SSE | Done |
| /model | Switch model | ✅ query.setModel() | Done |
| /cost | Cost breakdown | ✅ formatCostCommand | Done |
| /context | Context usage | ✅ formatContextCommand | Done |
| /diff | Full unified diff | ✅ Unified diff + stat | Done |
| /copy | Clipboard | ✅ Clipboard API | Done |
| /permissions | View rules | ✅ + rules editor | Done |
| /usage | Rate limits | ✅ formatUsageCommand | Done |
| /fast | Toggle fast | ✅ Wired to SDK | Done |
| /effort | Set effort | ✅ Passed to query() | Done |
| /plan | Plan mode | ✅ setPermissionMode() | Done |
| /rewind | 5 rewind options | ✅ query.rewindFiles() + dry-run | Done |
| /export | Markdown/JSON | ✅ Client-side download | Done |
| /init | Create CLAUDE.md | ✅ Scaffold template | Done |
| /doctor | Health checks | ✅ 5 diagnostic checks | Done |
| /stats | Usage stats | ✅ Analytics + charts | Done |
| /mcp | Server status | ✅ query.mcpServerStatus() | Done |
| /settings | Config editor | ✅ Writable settings panel | Done |
| /hooks | Hook editor | ✅ Create/edit/delete | Done |
| /memory | Memory editor | ✅ Read + write CLAUDE.md | Done |
| /shortcuts | Shortcut help | ✅ Shows list | Done |
| /rename | Rename session | ✅ SDK renameSession() | Done |
| /tasks | Task list | ✅ TaskPanel + Ctrl+T | Done |
| /analytics | Cross-session | ✅ Cost analytics | Done |
| ! (bash) | Shell execution | ✅ spawnSync in session cwd | Done |
| /resume | Resume session | ✅ Slash command + "last" arg | Done (Phase 3) |
| /config | Full settings | ✅ Settings panel | Done |
| /agents | Agent management | ✅ AgentManager panel + slash command | Done (Phase 3) |
| /add-dir | Multi-directory | ✅ Slash command + API endpoint | Done (Phase 3) |
| /login | Auth | ✅ claude auth login flow | Done (Phase 3) |
| /logout | Auth | ✅ claude auth logout | Done (Phase 3) |
| /review | PR review | ✅ Passthrough command | Done (Phase 3) |
| /output-style | Output styles | ✅ Style listing endpoint | Done (Phase 3) |
| /bug | Report bug | ✅ Opens GitHub issues | Done |
| /fork | Fork session | ✅ Slash command + API endpoint | Done |
| /batch | Parallel changes | ❌ Not built | Deferred |
| /loop | Scheduled tasks | ❌ Not built | Deferred |
| /voice | Voice input | ❌ Not built | Deferred |

## System 3: Memory

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| Read CLAUDE.md | ✅ | ✅ | Done |
| Edit CLAUDE.md | ✅ In-place | ✅ PUT endpoint | Done |
| 7-tier hierarchy | ✅ | ⚠️ Shows project-level | Partial |
| Quick-save (# syntax) | ✅ | ❌ | — |
| Auto-learned memory | ✅ | ❌ | — |

## System 4: Skills

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| Skill discovery | ✅ query.supportedCommands() | ✅ Dynamic via SDK | Done |
| Auto-invocation | ✅ | ❌ | — |
| Custom skills | ✅ .claude/skills/ | ❌ | — |
| Progressive loading | ✅ | ❌ | — |

## System 5: Subagents

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| Agent visualization | DAG in terminal | ✅ XYFlow DAG | Better than CLI |
| Agent event logs | Terminal output | ✅ Agent log panel | Better than CLI |
| Agent discovery | query.supportedAgents() | ✅ Dynamic via SDK | Done |
| Agent management | /agents command | ✅ AgentManager panel | Done (Phase 3) |
| Custom agent defs | .claude/agents/ | ✅ Read + display definitions | Done (Phase 3) |

## System 6: MCP

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| View servers | ✅ | ✅ McpManager | Done |
| Server status | query.mcpServerStatus() | ✅ SDK method | Done |
| Add server | ✅ | ✅ setMcpServers() | Done |
| Toggle server | query.toggleMcpServer() | ✅ SDK method | Done |
| Reconnect | query.reconnectMcpServer() | ✅ SDK method | Done |
| Remove server | ✅ | ✅ setMcpServers() | Done |

## System 7: Hooks

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| View hooks | ✅ | ✅ HookEditor | Done |
| Create hook | ✅ | ✅ | Done |
| Edit hook | ✅ | ✅ | Done |
| Delete hook | ✅ | ✅ | Done |
| Hook events in stream | SDK emits hook_* | ✅ SSE forwarded | Done |

## System 8: Plugins

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| Plugin discovery | ✅ | ❌ | Deferred |
| Install plugin | ✅ | ❌ | Deferred |
| Plugin management | ✅ | ❌ | Deferred |
| Create plugin | ✅ | ❌ | Deferred |

## System 9: Checkpoints

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| Auto-checkpoint | Every prompt | ✅ enableFileCheckpointing | Done |
| Rewind menu | 5 options | ✅ RewindMenu component | Done |
| /rewind command | query.rewindFiles() | ✅ SDK method + dry-run | Done |
| Dry-run preview | ✅ | ✅ | Done |

## System 10: Permissions

| Feature | CLI | We Have | Status |
|---------|-----|---------|--------|
| default mode | ✅ | ✅ | Done |
| acceptEdits mode | ✅ | ✅ | Done |
| plan mode | ✅ | ✅ | Done |
| auto mode | ✅ (Team+) | ✅ | Done |
| dontAsk mode | ✅ | ✅ | Done |
| bypassPermissions | ✅ | ✅ | Done |
| Permission rules | ToolName(pattern) | ✅ PermissionRulesEditor | Done |
| canUseTool options | title, displayName, etc. | ✅ All forwarded | Done |
| Shift+Tab cycling | ✅ | ✅ (6 modes) | Done |

---

## SDK Methods Usage

| Method | Status | Where |
|--------|--------|-------|
| `setModel()` | ✅ Used | session-manager.ts |
| `setPermissionMode()` | ✅ Used | session-manager.ts |
| `rewindFiles()` | ✅ Used | session-manager.ts |
| `mcpServerStatus()` | ✅ Used | mcp-routes.ts |
| `supportedModels()` | ✅ Used | discovery-routes.ts |
| `supportedCommands()` | ✅ Used | discovery-routes.ts |
| `toggleMcpServer()` | ✅ Used | mcp-routes.ts |
| `reconnectMcpServer()` | ✅ Used | mcp-routes.ts |
| `setMcpServers()` | ✅ Used | mcp-routes.ts |
| `supportedAgents()` | ✅ Used | discovery-routes.ts |
| `interrupt()` | ❌ | We use AbortController |
| `stopTask()` | ❌ | Phase 3 |
| `initializationResult()` | ❌ | Phase 3 |
| `accountInfo()` | ❌ | Phase 3 |
| `streamInput()` | ❌ | Deferred |
| `applyFlagSettings()` | ❌ | Deferred |

---

## Phase 3 Completion (2026-03-30)

Phase 3 shipped in commit `5eae4d9`. 12 features implemented:
/agents, /resume, /add-dir, /review, /login, /logout, /output-style, TaskMonitor, TranscriptSearch, keyboard shortcuts (Alt+P/T/O, Ctrl+B, Esc Esc), AgentManager panel.

**Current parity: ~92%**

## Phase 4–5 Additions (2026-04-12)

- **Phase 2 orphan panels resolved** — `PanelModal.tsx` now exposes all 9 management panels (Settings, Hooks, CLAUDE.md, Permissions, MCP, Agents, Doctor, Stats, PermissionHistory) via slash commands and modal. `handleOpenPanel` in `SessionPage.tsx` is no longer a no-op.
- **Phase 5 Controls (~85% done)** — `ControlsZone` in topbar (model switcher, fast mode, effort slider, context compact) shown during LIVE sessions via `useSessionControl`. Permission history panel added.
- **Tasks tab in bottom panel** — `TasksTab.tsx` shows TodoWrite task list extracted from session events. 4th tab in `BottomPanel`.
- **Bug fixes merged** (PRs #19–21): filterDagForTurn status memoization, cwd validation, conversation layout order.

## Remaining Gaps (minor)

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 1 | Customizable keybindings | Medium | Currently hardcoded in useKeyboardShortcuts.ts |
| 2 | ~~/diff unified format~~ | ~~Small~~ | **FIXED** — server already returns unified diff |
| 3 | ~~/rename via SDK~~ | ~~Small~~ | **FIXED** — server already calls renameSession() |
| 4 | ~~/bug report~~ | ~~Small~~ | **FIXED** — opens GitHub issues page |

## Quality Issues (from audit, Phase 3.5)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| A-01 | Cost missing cache tokens | P1 | **FIXED** (commit `6bf2e8e`) |
| A-02 | Permission mode naming | P1 | **FIXED** (commit `6bf2e8e`) |
| A-03 | Snapshot locks agent graph | P2 | **FIXED** (filterDagForTurn status memoization, PR #19) |
| A-04 | Hooks showing incomplete data | P2 | **FIXED** (PanelModal — HookEditor accessible via /hooks) |
| A-05 | No code splitting | P2 | **FIXED** (route-level lazy loading + React.lazy BottomPanel) |
| A-06 | Conversation memory growth | P2 | **FIXED** (TurnSnapshot index-based, no duplication) |
| A-07 | Duration formatting | P3 | **FIXED** (Math.floor in formatDuration) |
| A-08 | Theme toggle location | P3 | **FIXED** (light/dark/high-contrast toggle in ThemeContext) |
| A-09 | Duplicate prompt edge case | P3 | Investigated — no reproduction case documented, downgraded to unconfirmed |

### Deferred (Not in Plan)

| Feature | Reason |
|---------|--------|
| Plugin system | Wait for Anthropic plugin distribution stability |
| Voice input | Browser Speech API — separate effort |
| /loop scheduled tasks | Low demand |
| /batch parallel changes | Complex orchestration — future |
| Collaborative viewing | Complex — future project |
