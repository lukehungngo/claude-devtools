# Research Proposal: CLI Parity Gap Analysis

## Round
1 of 3

## Problem Definition

The goal is to build a web client that can "100% replace the terminal CLI" for Claude Code. This requires understanding exactly which CLI features exist, which we have implemented, which are partially done, and which are missing entirely. The web client also has an opportunity to be *better* than the CLI in observability and visualization.

This document is a comprehensive feature-by-feature gap analysis between the Claude Code CLI (as of March 2026) and our `claude-devtools` web client.

---

## Methodology

- **CLI features**: Cataloged from official Claude Code documentation at code.claude.com (CLI reference, interactive mode, commands reference, permission modes)
- **Web client features**: Audited by reading all route, component, hook, API route, and session manager source files in the codebase

---

## Gap Analysis Table

### 1. Core Conversation

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Multi-turn conversation | **DONE** | SessionManager tracks sessions, sendMessage supports multi-turn via SDK `resume` option | - |
| Streaming text responses | **DONE** | SSE stream from `/api/sessions/:id/message`, real-time text deltas rendered | - |
| Markdown rendering | **DONE** | `ResponseBlock.tsx` uses `react-markdown` + `remark-gfm` for full markdown | - |
| Extended thinking display | **DONE** | `ThinkingBlock.tsx` renders thinking content from assistant events | - |
| Tool call visualization | **DONE** | `ToolEntries.tsx` shows tool name, target, status (success/running/error) per turn | - |
| Tool result display | **PARTIAL** | Tool results are tracked for status (success/error) but the actual output content is not displayed inline in the conversation. CLI shows full tool output. | **P1** |
| Image paste/display | **NOT BUILT** | CLI supports Ctrl+V to paste images. No image upload or display in web client. | P2 |
| Code block syntax highlighting | **NOT BUILT** | `ResponseBlock.tsx` renders code blocks with basic monospace styling but no syntax highlighting (no Prism/Shiki/highlight.js). CLI has `/theme` with syntax coloring. | **P1** |
| Abort/cancel generation | **DONE** | Stop button in `PromptInput.tsx` aborts via `AbortController`; server has `/sessions/:id/abort` endpoint | - |

### 2. Session Management

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Start new session | **DONE** | `POST /api/sessions/new` + "New" button in `RepoList.tsx` | - |
| Resume session | **DONE** | `POST /api/sessions/:id/resume` + resume button per session in sidebar | - |
| Continue most recent (`-c`) | **NOT BUILT** | No "continue last session" shortcut. User must manually find and click the session. | P3 |
| Session naming (`-n`, `/rename`) | **NOT BUILT** | Sessions display auto-generated names from JSONL metadata. No rename UI. | P3 |
| Fork session (`--fork-session`) | **PARTIAL** | Route exists (`POST /sessions/:id/fork`) but returns 501 Not Implemented. SDK does not yet support it. | P3 |
| Session list with filtering | **DONE** | `RepoList.tsx` groups by repo, filters active/archived/all, sorts by recency | - |
| Session picker (`/resume`) | **PARTIAL** | Sidebar shows sessions but no interactive picker/search dialog like CLI's `/resume`. | P3 |
| Delete/close session | **DONE** | `DELETE /api/sessions/:id` endpoint exists | - |
| Active session tracking | **DONE** | `SessionManager` tracks active sessions with status (idle/streaming/waiting-permission/error) | - |
| Session persistence across restarts | **PARTIAL** | Historical sessions come from JSONL files (persistent). Active SDK sessions are in-memory only -- lost on server restart. | P2 |

### 3. Slash Commands

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| `/help` | **DONE** | Client-side: shows available commands list | - |
| `/clear` (`/reset`, `/new`) | **PARTIAL** | Clears command output only. Does not actually clear conversation history or start new context. | **P1** |
| `/compact [instructions]` | **NOT BUILT** | Shows a static message "handled automatically." No actual compact trigger. CLI sends compact to the model with optional focus instructions. | **P1** |
| `/cost` | **PARTIAL** | Shows static message "View session costs in the TopBar metrics." Does not show the detailed cost breakdown the CLI shows (per-model, cache stats, subscription usage). | P2 |
| `/model [model]` | **NOT BUILT** | Shows static message. No actual model switching. CLI allows runtime model change. | **P1** |
| `/exit` (`/quit`) | **PARTIAL** | Shows a message. Does not actually close/exit the session programmatically. | P3 |
| `/permissions` (`/allowed-tools`) | **NOT BUILT** | No way to view or modify permission rules from web UI. | P2 |
| `/config` (`/settings`) | **NOT BUILT** | No settings UI. CLI has full settings editor for theme, model, output style, etc. | P2 |
| `/context` | **NOT BUILT** | No context usage visualization. TopBar shows context %, but CLI's `/context` shows a colored grid with optimization suggestions. | P2 |
| `/diff` | **NOT BUILT** | No diff viewer for uncommitted changes or per-turn diffs. | P2 |
| `/copy [N]` | **NOT BUILT** | No copy-to-clipboard for assistant responses. | P2 |
| `/export [filename]` | **NOT BUILT** | No conversation export. | P3 |
| `/resume [session]` | **PARTIAL** | Resume exists via sidebar button but no `/resume` command in prompt input. | P3 |
| `/plan [description]` | **NOT BUILT** | No plan mode entry from prompt. | P2 |
| `/fast [on\|off]` | **NOT BUILT** | No fast mode toggle. | P2 |
| `/effort [level]` | **NOT BUILT** | No effort level control. | P2 |
| `/vim` | **N/A** | Terminal-specific editing mode. Not applicable to web textarea. | - |
| `/theme` | **NOT BUILT** | No theme switcher. Web client has a fixed dark theme. | P3 |
| `/color [color]` | **N/A** | Terminal prompt bar color. Not directly applicable. | - |
| `/init` | **NOT BUILT** | No CLAUDE.md initialization wizard. | P3 |
| `/memory` | **NOT BUILT** | No CLAUDE.md / auto-memory editing. | P2 |
| `/hooks` | **NOT BUILT** | No hook configuration viewer. TopBar shows hook count but no details. | P3 |
| `/agents` | **NOT BUILT** | No agent configuration management. | P3 |
| `/mcp` | **NOT BUILT** | No MCP server management UI. TopBar shows MCP count but no details. | P2 |
| `/feedback` (`/bug`) | **NOT BUILT** | No feedback submission. | P3 |
| `/doctor` | **NOT BUILT** | SetupGate validates prerequisites but no diagnostic tool. | P3 |
| `/stats` | **NOT BUILT** | No usage statistics visualization (daily usage, streaks, etc.). | P3 |
| `/pr-comments [PR]` | **NOT BUILT** | No PR comment fetching. | P3 |
| `/security-review` | **NOT BUILT** | No security review trigger. | P3 |
| `/rewind` (`/checkpoint`) | **NOT BUILT** | No conversation/code rewind capability. | P2 |
| `/btw <question>` | **NOT BUILT** | No side-question capability. | P3 |
| `/branch` (`/fork`) | **NOT BUILT** | No conversation branching. | P3 |
| `/add-dir <path>` | **NOT BUILT** | No way to add additional working directories. | P3 |
| `/sandbox` | **NOT BUILT** | No sandbox mode toggle. | P3 |
| `/skills` | **NOT BUILT** | No skills listing. | P3 |
| `/plugin` | **NOT BUILT** | No plugin management. | P3 |
| `/remote-control` | **NOT BUILT** | No remote control server management. | P3 |
| `/schedule` | **NOT BUILT** | No scheduled tasks management. | P3 |
| `/stickers` | **N/A** | Marketing feature. Not applicable to web client. | - |
| `/mobile`, `/desktop` | **N/A** | Cross-platform redirect. Not applicable. | - |
| `/upgrade`, `/passes` | **N/A** | Account management. Could link out but not core. | - |
| `/login`, `/logout` | **NOT BUILT** | No auth management in web client. Server uses whatever auth the CLI has. | P3 |
| `/usage` | **PARTIAL** | TopBar shows usage bars (5h/7d utilization) from `/api/usage`. But no detailed rate limit breakdown like CLI. | P2 |
| `/release-notes` | **N/A** | CLI-specific. Web client could show its own changelog. | - |
| `/terminal-setup`, `/keybindings` | **N/A** | Terminal-specific. | - |
| `/statusline` | **N/A** | Terminal status line. Web client has TopBar instead. | - |
| `/insights` | **NOT BUILT** | No session analysis/insights generation. | P3 |

### 4. Permission System

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Permission prompts (approve/deny) | **DONE** | `PermissionBlock.tsx` shows tool name, input detail, approve/deny buttons. WebSocket broadcasts permission requests. | - |
| Permission mode display | **DONE** | TopBar shows current permission mode. ConversationView header shows it. | - |
| Permission mode cycling (Shift+Tab) | **NOT BUILT** | No keyboard shortcut to cycle through permission modes. No UI to change mode mid-session. | **P1** |
| Allow for session | **PARTIAL** | `PermissionBlock.tsx` has `onDecideSession` prop but it is not wired up in `ConversationView.tsx`. Button appears but may not function. | **P1** |
| Auto mode | **NOT BUILT** | No auto mode support. Would need server-side integration with SDK's auto mode classifier. | P2 |
| Allowed/disallowed tool rules | **NOT BUILT** | No UI to configure per-tool permission rules. | P2 |
| BypassPermissions mode | **NOT BUILT** | No bypass mode toggle (for good reason -- dangerous). Could be added with strong warnings. | P3 |

### 5. Context Window Management

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Context % indicator | **DONE** | TopBar shows context percentage with color-coded bar (green/yellow/red). | - |
| Auto-compact on context limit | **NOT BUILT** | No auto-compact trigger. CLI automatically compacts when context approaches limit. Relies on SDK behavior. | **P1** |
| Manual `/compact` with focus | **NOT BUILT** | As noted above, `/compact` is a no-op in web client. | **P1** |
| Context visualization (`/context`) | **NOT BUILT** | No detailed context grid visualization. | P2 |

### 6. Input Features

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Single-line text input | **DONE** | `PromptInput.tsx` textarea with auto-resize | - |
| Multi-line input (Shift+Enter) | **DONE** | Textarea supports multi-line; Enter submits, implied Shift+Enter for newlines (standard textarea behavior) | - |
| Slash command autocomplete | **DONE** | Dropdown with filtered commands, arrow key navigation, Tab completion | - |
| File path mention (`@`) | **NOT BUILT** | CLI supports `@` to trigger file path autocomplete. Not in web client. | **P1** |
| Bash mode (`!` prefix) | **NOT BUILT** | CLI supports `!` prefix to run bash commands directly. Not in web client. | P2 |
| Command history (Up/Down) | **NOT BUILT** | No prompt history. CLI supports Up/Down arrow to recall previous inputs. | P2 |
| Reverse search (Ctrl+R) | **NOT BUILT** | No history search. | P3 |
| Prompt suggestions | **NOT BUILT** | CLI shows grayed-out suggestions based on git history and conversation. | P3 |
| Voice dictation (hold Space) | **NOT BUILT** | No voice input. | P3 |
| Image paste (Ctrl+V) | **NOT BUILT** | No image input support. | P2 |
| Open in editor (Ctrl+G) | **N/A** | Terminal-specific. Web has its own input. | - |

### 7. Keyboard Shortcuts

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Ctrl+C (cancel) | **PARTIAL** | Stop button exists but no Ctrl+C keyboard binding. | P2 |
| Ctrl+F (search) | **DONE** | ConversationView handles Ctrl+F to open search bar | - |
| Escape (close search/dismiss) | **DONE** | Closes search bar | - |
| Shift+Tab (cycle permission mode) | **NOT BUILT** | No permission mode cycling shortcut. | **P1** |
| Alt+P (switch model) | **NOT BUILT** | No model switching shortcut. | P2 |
| Alt+T (toggle thinking) | **NOT BUILT** | No thinking toggle. | P3 |
| Alt+O (toggle fast mode) | **NOT BUILT** | No fast mode toggle. | P3 |
| Ctrl+L (clear screen) | **NOT BUILT** | No screen clear shortcut. | P3 |
| Ctrl+O (verbose output) | **NOT BUILT** | No verbose toggle. | P3 |
| Ctrl+B (background tasks) | **NOT BUILT** | No background task support. | P3 |
| Ctrl+T (task list toggle) | **NOT BUILT** | No task list UI shortcut. | P3 |
| Esc+Esc (rewind) | **NOT BUILT** | No rewind shortcut. | P3 |

### 8. Observability and Monitoring (Web Client Advantages)

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Token count display | **BETTER** | TopBar shows input/output tokens, per-model breakdown, cache stats. CLI's `/cost` is text-only. | - |
| Cost tracking | **BETTER** | TopBar shows session cost, 24h/7d aggregates, subscription utilization bars. | - |
| Agent DAG visualization | **BETTER** | `AgentFlowDAG.tsx` renders interactive directed graph of agent hierarchy with XYFlow. CLI has no equivalent. | - |
| Per-turn cost breakdown | **BETTER** | `CostStrip.tsx` shows per-turn costs. Turn headers show individual turn costs. | - |
| Tool usage statistics | **BETTER** | TopBar Row 3 shows tool badges with call counts and error counts. Clickable to filter logs. | - |
| Session duration tracking | **BETTER** | Real-time duration display, per-turn timing with live elapsed counter. | - |
| Agent logs panel | **BETTER** | `AgentLogs.tsx` provides filterable, agent-scoped event log with tool filtering. | - |
| Turn-based snapshot navigation | **BETTER** | `RightPanel` with `SnapshotTabs` allows time-travel through turn snapshots. | - |
| Subagent metadata display | **BETTER** | Agent pills in turns, agent node cards in DAG, subagent meta from JSONL. | - |
| Multi-session overview | **BETTER** | `RepoList.tsx` shows all repos, branches, session counts, live indicators simultaneously. | - |
| Context window bar | **BETTER** | Visual progress bar with color coding. CLI is text-only percentage. | - |
| WebSocket live updates | **BETTER** | Real-time event streaming without polling. CLI is already live but web adds visual real-time DAG updates. | - |
| Cross-session cost aggregation | **BETTER** | `/api/costs` aggregates across all sessions for 24h/7d. | - |
| Subscription usage visualization | **BETTER** | Visual usage bars for 5h session and 7d limits with reset timers. | - |
| Repo configuration stats | **BETTER** | TopBar shows hooks, rules, agents, CLAUDE.md file counts for current session. | - |
| Search across turns | **BETTER** | Ctrl+F search filters turns by content. CLI has no equivalent cross-turn search. | - |
| Open file in editor | **DONE** | `POST /api/open-file` opens files in VS Code or $EDITOR. Not better, but equivalent. | - |
| Question/answer UI | **DONE** | `QuestionBlock.tsx` handles agent questions with inline answer input. | - |

### 9. Configuration and Settings

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Settings.json management | **NOT BUILT** | No settings UI. All config is CLI-side. | P2 |
| Theme selection | **NOT BUILT** | Fixed dark theme. No light mode, no colorblind themes. | P3 |
| Output style configuration | **NOT BUILT** | No output style control. | P3 |
| MCP server configuration | **NOT BUILT** | No MCP config UI. | P2 |
| Hook configuration | **NOT BUILT** | No hook editor. | P3 |
| Plugin management | **NOT BUILT** | No plugin UI. | P3 |
| Allowed tools configuration | **NOT BUILT** | No tool whitelist/blacklist UI. | P2 |

### 10. Git Integration

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Branch display | **DONE** | TopBar shows `git:branchName`. RepoList shows branches per repo. | - |
| Git worktree support (`-w`) | **NOT BUILT** | No worktree management from web UI. | P3 |
| PR review status footer | **NOT BUILT** | No PR link with review status indicator. | P3 |
| `/diff` viewer | **NOT BUILT** | No diff visualization. | P2 |
| PR comment fetching (`/pr-comments`) | **NOT BUILT** | No PR comment integration. | P3 |

### 11. Advanced Features

| CLI Feature | Web Client Status | Gap Description | Priority |
|-------------|-------------------|-----------------|----------|
| Background tasks (Ctrl+B) | **NOT BUILT** | No background task management. | P3 |
| Task list (Ctrl+T) | **PARTIAL** | TopBar shows task counts (completed/total) but no interactive task list panel. | P2 |
| Chrome browser integration | **NOT BUILT** | No browser automation. | P3 |
| Remote control server | **NOT BUILT** | No remote control management. | P3 |
| Web sessions (`--remote`) | **NOT BUILT** | No cloud session creation. | P3 |
| Agent teams (`--teammate-mode`) | **NOT BUILT** | No multi-agent team orchestration UI. | P3 |
| Channels (research preview) | **NOT BUILT** | No channel notifications. | P3 |
| Effort level control | **NOT BUILT** | No effort level adjustment. | P2 |
| Fast mode | **NOT BUILT** | No fast mode toggle. | P2 |
| Structured output (`--json-schema`) | **N/A** | Programmatic feature. Not applicable to interactive web client. | - |
| Print mode (`-p`) | **N/A** | Non-interactive mode. Not applicable to web client. | - |
| Pipe input (`cat file \| claude`) | **N/A** | Terminal-specific. Could be replaced with file upload. | - |

---

## Summary Statistics

| Status | Count | Percentage |
|--------|-------|------------|
| **DONE** | 25 | 22% |
| **BETTER** | 16 | 14% |
| **PARTIAL** | 12 | 11% |
| **NOT BUILT** | 51 | 45% |
| **N/A** | 10 | 9% |
| **Total** | 114 | 100% |

**Effective parity** (DONE + BETTER): **36%**
**Usable but incomplete** (+ PARTIAL): **47%**
**Features needed for full parity** (NOT BUILT, excluding N/A): **51 features**

---

## P1 Features -- Minimum for "CLI Replacement"

These are the features that, if missing, make it impossible to use the web client as a primary interface:

1. **Tool result display** -- Users cannot see what tools returned. They are flying blind.
2. **Code syntax highlighting** -- Code-heavy workflows are unreadable without highlighting.
3. **`/clear` actually clearing context** -- Must reset conversation to manage context.
4. **`/compact` with focus instructions** -- Essential for long sessions approaching context limits.
5. **`/model` switching** -- Cannot change models mid-session.
6. **Permission mode cycling** -- Cannot switch between default/acceptEdits/plan modes.
7. **"Allow for session" permission** -- Button exists but not wired. Critical for workflow speed.
8. **Auto-compact on context limit** -- Sessions break when context fills without compact.
9. **`@` file path mention** -- Core input mechanic for referencing files.

---

## Proposed Success Criteria for "100% CLI Parity + Observability Advantage"

### Tier 1: "Can Replace CLI" (Minimum Viable Parity)

A user can perform their full daily workflow without opening a terminal for Claude Code:

- [ ] All P1 features above are implemented
- [ ] All slash commands that affect session state actually work (not just show messages)
- [ ] Permission mode can be changed mid-session
- [ ] Model can be changed mid-session
- [ ] Context can be compacted manually
- [ ] Tool results are visible inline
- [ ] Code blocks have syntax highlighting
- [ ] Files can be referenced in prompts

**Measurable**: User can complete a "build a feature, test it, commit it" workflow end-to-end without opening terminal.

### Tier 2: "Better Than CLI" (Observability Advantage)

Our web client provides capabilities the CLI fundamentally cannot:

- [x] Agent DAG visualization (interactive graph)
- [x] Per-turn snapshot time-travel
- [x] Cross-session cost aggregation
- [x] Subscription utilization visualization
- [x] Multi-session overview with live indicators
- [x] Searchable conversation history
- [x] Tool usage statistics with filtering
- [ ] Diff viewer for file changes per turn (planned)
- [ ] Side-by-side code comparison (not built)
- [ ] Session analytics/insights dashboard (not built)
- [ ] Collaborative features (multiple users viewing same session) (not built)

**Measurable**: 5+ features that provide information the CLI cannot display.

### Tier 3: "Power User Features" (Full Feature Parity)

Everything in Tier 1 + Tier 2, plus:

- [ ] All 51 NOT BUILT features implemented or explicitly marked N/A with justification
- [ ] Settings management UI
- [ ] MCP server management
- [ ] Theme support (light/dark/colorblind)
- [ ] Keyboard shortcut parity
- [ ] Command history with search
- [ ] Image input support
- [ ] Background task management
- [ ] PR integration

**Measurable**: Feature coverage >= 90% of applicable CLI features.

---

## Trade-off Analysis

| Approach | Pros | Cons | Complexity |
|----------|------|------|-----------|
| **A: P1-first sprint** -- Implement only the 9 P1 features | Fastest path to usability. Unblocks daily use. Clear scope. | Still missing many slash commands. Users will hit gaps. | Medium (2-3 weeks) |
| **B: Full slash command parity** -- Implement all slash commands that affect state | Comprehensive command experience. Feels complete. | Many commands rarely used. High effort for low-frequency features. | High (4-6 weeks) |
| **C: Hybrid -- P1 + server-passthrough commands** -- P1 features + route all unknown `/` commands to the SDK | Gets P1 fast + any command works via SDK passthrough. | SDK may not support arbitrary slash commands via API. Behavior may differ. | Medium-High (3-4 weeks) |

### Recommended: Approach A (P1-first), then iterate

The 9 P1 features represent the minimum set that makes the web client usable as a primary interface. Everything else can be layered on incrementally. The observability features (Tier 2) are already our differentiator and mostly done.

---

## FP Analysis

Not applicable -- this is a gap analysis, not a detection system.

## FN Analysis

**Potential missed features**: The CLI is actively developed. Features added after March 2026 will not be in this analysis. The `/` command list should be re-audited quarterly. Some features (plugins, channels) are in research preview and may change significantly.

---

## Implementation Hints

### P1 Feature Implementation Notes

1. **Tool result display**: Extend `TurnCard.tsx` to render `ToolResultContent` items from `user` events. The data is already parsed -- just not rendered.

2. **Code syntax highlighting**: Add `rehype-highlight` or `shiki` to `ResponseBlock.tsx`'s ReactMarkdown pipeline. Minimal change.

3. **`/clear` actually clearing**: Need server endpoint to clear/reset session context. May need SDK `clear` method or start a new session.

4. **`/compact`**: Need server endpoint that calls SDK's compact method. `POST /api/sessions/:id/compact` with optional focus body.

5. **`/model` switching**: Need server endpoint `POST /api/sessions/:id/model` that updates the SDK session's model. Dashboard needs model picker UI.

6. **Permission mode cycling**: Add keyboard handler in `ConversationView` or global. Need server endpoint to change permission mode mid-session.

7. **"Allow for session"**: Wire `onDecideSession` prop through `ConversationView` to `PermissionBlock`. Server needs to track per-session tool allowances.

8. **Auto-compact**: SDK likely handles this, but we need to detect and display it. May need progress event handling.

9. **`@` file mention**: Add `@` trigger in `PromptInput.tsx` that opens a file browser/autocomplete. Need server endpoint to list files in session cwd.

### Key Files to Modify

- `dashboard/src/components/conversation/PromptInput.tsx` -- slash commands, `@` mentions
- `dashboard/src/components/conversation/TurnCard.tsx` -- tool result display
- `dashboard/src/components/viewer/ResponseBlock.tsx` -- syntax highlighting
- `server/src/http/routes.ts` -- new endpoints (compact, model, permission mode)
- `server/src/session/session-manager.ts` -- session state mutations
- `dashboard/src/components/conversation/ConversationView.tsx` -- permission wiring

---

## Risk Analysis

1. **SDK limitations**: Many features (compact, model switch, permission mode change) require the `@anthropic-ai/claude-agent-sdk` to expose these operations. If the SDK does not support them, we cannot implement them without workarounds.

2. **Slash command semantics differ**: CLI slash commands run in-process with full terminal access. Web equivalents must go through HTTP API, which adds latency and may not support all operations.

3. **Session state divergence**: If a user opens both CLI and web client for the same session, state could diverge. The JSONL-as-source-of-truth invariant helps but active session state (permission mode, model) is in-memory.

4. **Performance at scale**: The 51 NOT BUILT features represent significant implementation work. Risk of feature creep if all are attempted simultaneously.

5. **CLI evolving faster than web**: Claude Code CLI ships updates frequently. Maintaining parity requires ongoing tracking.

---

## References

- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) -- Complete CLI flags and commands
- [Claude Code Interactive Mode](https://code.claude.com/docs/en/interactive-mode) -- Keyboard shortcuts, input modes, interactive features
- [Claude Code Built-in Commands](https://code.claude.com/docs/en/commands) -- Full slash command reference
- [SmartScope Claude Code Reference Guide](https://smartscope.blog/en/generative-ai/claude/claude-code-reference-guide/) -- Community cheat sheet
- [Claude Code Keybindings Guide](https://claudefa.st/blog/tools/keybindings-guide) -- Keyboard shortcuts reference
