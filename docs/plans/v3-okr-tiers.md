# V3 OKR, Metrics & Task Breakdown by Tier

**Author:** Luke + Claude
**Date:** 2026-03-29
**Status:** Active
**Source:** `docs/plans/cli-parity-gap-analysis.md`

---

## Objective

**Make claude-devtools a full Claude Code web client that replaces the terminal CLI and adds observability the CLI cannot provide.**

Current effective CLI parity: **~55%** (Tier 1 complete, 9 P1 features implemented).

---

## Tier 1: "Can Replace CLI" — Minimum Viable Parity

### OKR

**Objective:** A developer can use the web client as their primary Claude Code interface for a full coding session.

| Key Result | Metric | Target |
|------------|--------|--------|
| KR1: All P1 interactive features work | 9 P1 features implemented and tested | 9/9 |
| KR2: Slash commands affect session state | Commands that show static messages actually trigger SDK operations | /clear, /compact, /model all functional |
| KR3: End-to-end workflow test | A user can "build feature → test → commit" without opening terminal | Pass manual smoke test |
| KR4: No silent session failures | Context limit, errors, and aborts are visible and recoverable | 0 silent failures in 1h session |

### Tasks

| ID | Task | Files | Effort | Depends On |
|----|------|-------|--------|------------|
| T1-01 | **Tool result display** — Render `tool_result` content inline in TurnCard (data is parsed, just not displayed) | `TurnCard.tsx`, `ToolEntries.tsx` | 3h | — |
| T1-02 | **Code syntax highlighting** — Add `rehype-highlight` or `shiki` to ReactMarkdown pipeline in ResponseBlock | `ResponseBlock.tsx`, `package.json` | 2h | — |
| T1-03 | **`/clear` clears context** — Route `/clear` to server endpoint that starts a new session (or SDK clear). Update PromptInput + add `POST /api/sessions/:id/clear` | `PromptInput.tsx`, `routes.ts`, `session-manager.ts` | 2h | — |
| T1-04 | **`/compact` with focus** — Route `/compact` to server endpoint. `POST /api/sessions/:id/compact` with optional focus body. SDK `compact()` call. | `PromptInput.tsx`, `routes.ts`, `session-manager.ts` | 3h | — |
| T1-05 | **`/model` switching** — Model picker dropdown + `POST /api/sessions/:id/model`. Update PromptInput slash command. Show current model in TopBar. | `PromptInput.tsx`, `TopBar.tsx`, `routes.ts`, `session-manager.ts` | 3h | — |
| T1-06 | **Permission mode cycling** — Keyboard shortcut (Shift+Tab) + dropdown in ConversationView header. `POST /api/sessions/:id/permission-mode`. | `ConversationView.tsx`, `routes.ts`, `session-manager.ts` | 3h | — |
| T1-07 | **Wire "Allow for session"** — Connect `onDecideSession` through ConversationView → AppLayout → server. Track per-session tool allowances. | `ConversationView.tsx`, `AppLayout.tsx`, `permission-handler.ts` | 2h | — |
| T1-08 | **Auto-compact on context limit** — Detect context > 90% from metrics, trigger compact automatically or show warning. | `useSessionMetrics.ts`, `session-manager.ts` | 2h | T1-04 |
| T1-09 | **`@` file path mentions** — `@` trigger in PromptInput opens file browser autocomplete. `GET /api/sessions/:id/files` lists files in session cwd. | `PromptInput.tsx`, `routes.ts` | 4h | — |

**Total estimated: ~24h**

### Success Metrics

- [x] Tool results visible for Read, Write, Edit, Bash, Glob, Grep tools (T1-01, PR #7)
- [x] Code blocks render with language-specific syntax highlighting (T1-02, PR #7)
- [x] `/clear` resets conversation context (new session or SDK clear) (T1-03, PR #7)
- [x] `/compact` triggers context compaction with optional focus instructions (T1-04, PR #7)
- [x] `/model` changes the model for subsequent messages (T1-05, PR #7)
- [x] Permission mode can be changed mid-session via UI or keyboard (T1-06, PR #7)
- [x] "Allow for session" button works end-to-end (T1-07, PR #7)
- [x] Context > 90% triggers auto-compact or visible warning (T1-08, PR #7)
- [x] `@` in prompt triggers file path autocomplete from session cwd (T1-09, PR #7)

---

## Tier 2: "Better Than CLI" — Observability Advantage

### OKR

**Objective:** The web client provides capabilities the terminal CLI fundamentally cannot, making it the preferred interface for complex/multi-agent sessions.

| Key Result | Metric | Target |
|------------|--------|--------|
| KR1: Observability features | Unique features not possible in CLI | 10+ features (currently 16) |
| KR2: Diff/change visualization | Users can see what files changed per turn | Diff viewer implemented |
| KR3: Session analytics | Cost/time/tool patterns across sessions | Analytics dashboard implemented |
| KR4: Advanced slash commands | P2 commands that enhance the web experience | 8+ P2 commands working |

### Tasks

| ID | Task | Files | Effort | Depends On |
|----|------|-------|--------|------------|
| T2-01 | **Diff viewer** — Show file diffs per turn (from Edit/Write tool calls). Side-by-side or unified diff view. | New: `DiffViewer.tsx`, `TurnCard.tsx` | 4h | T1-01 |
| T2-02 | **`/cost` detailed breakdown** — Show per-model costs, cache stats, subscription usage in a modal/panel | `PromptInput.tsx`, new: `CostDetail.tsx` | 2h | — |
| T2-03 | **`/context` visualization** — Context window grid showing what's consuming context (files, conversation, tools) | New: `ContextView.tsx`, `routes.ts` | 4h | — |
| T2-04 | **`/permissions` viewer** — View and modify per-tool permission rules | New: `PermissionRulesPanel.tsx`, `routes.ts` | 3h | — |
| T2-05 | **`/diff` command** — Show uncommitted git changes in the session's cwd | `PromptInput.tsx`, `routes.ts`, new: `GitDiff.tsx` | 3h | — |
| T2-06 | **`/copy` command** — Copy last N assistant responses to clipboard | `PromptInput.tsx` | 1h | — |
| T2-07 | **Command history (Up/Down)** — Recall previous prompts with arrow keys | `PromptInput.tsx` | 2h | — |
| T2-08 | **`/plan` mode entry** — Enter plan mode from prompt (read-only, no tool execution) | `PromptInput.tsx`, `session-manager.ts` | 2h | T1-06 |
| T2-09 | **`/fast` toggle** — Toggle fast mode on/off | `PromptInput.tsx`, `session-manager.ts` | 1h | — |
| T2-10 | **`/effort` control** — Set effort level (low/medium/high) | `PromptInput.tsx`, `session-manager.ts` | 1h | — |
| T2-11 | **Ctrl+C cancel binding** — Keyboard shortcut to abort generation | `ConversationView.tsx` | 1h | — |
| T2-12 | **`/rewind` (checkpoint)** — Rewind conversation to a previous turn | `PromptInput.tsx`, `routes.ts`, `session-manager.ts` | 4h | — |
| T2-13 | **`/mcp` server status** — Show connected MCP servers, their tools, and status | New: `McpPanel.tsx`, `routes.ts` | 3h | — |
| T2-14 | **`/usage` detailed** — Detailed rate limit breakdown (not just utilization bars) | `PromptInput.tsx`, `TopBar.tsx` | 2h | — |
| T2-15 | **Image paste/upload** — Paste or upload images as part of prompt | `PromptInput.tsx` | 3h | — |
| T2-16 | **Task list panel** — Interactive task list (Ctrl+T) showing TaskCreate/TaskUpdate tasks | New: `TaskPanel.tsx` | 3h | — |
| T2-17 | **`!` bash mode** — Run bash commands directly from prompt with `!` prefix | `PromptInput.tsx`, `routes.ts` | 2h | — |
| T2-18 | **Session analytics** — Cost/time/tool patterns across sessions, usage trends | New: `AnalyticsDashboard.tsx` | 6h | — |
| T2-19 | **Surface SSE errors to user** — SSE error results (`data.type === "result"` with `is_error`) are silently discarded in PromptInput. Show error message in conversation. | `PromptInput.tsx`, `ConversationView.tsx` | 1h | — |

**Total estimated: ~48h**

### Success Metrics

- [ ] File diffs visible per turn for Edit/Write operations
- [ ] `/cost` shows detailed per-model breakdown with cache stats
- [ ] Context visualization shows what's consuming the context window
- [ ] Permission rules viewable and editable
- [ ] Git diffs viewable from web UI
- [ ] Prompt history navigable with Up/Down arrows
- [ ] 8+ P2 slash commands functional
- [ ] Session analytics dashboard with cost/time trends
- [ ] SSE errors surfaced to user (not silently discarded)

---

## Tier 3: "Power User Features" — Full Feature Parity

### OKR

**Objective:** Feature coverage >= 90% of applicable CLI features. Power users have no reason to switch back to the terminal.

| Key Result | Metric | Target |
|------------|--------|--------|
| KR1: Feature coverage | % of applicable CLI features implemented | >= 90% |
| KR2: Configuration parity | Settings, themes, hooks, MCP all manageable from web | 4/4 config areas |
| KR3: Keyboard parity | All CLI keyboard shortcuts have web equivalents | >= 80% of shortcuts |
| KR4: Collaboration features | Multi-user session viewing | 1+ collab feature |

### Tasks

| ID | Task | Files | Effort | Depends On |
|----|------|-------|--------|------------|
| T3-01 | **Settings UI** — Full settings editor matching CLI's `/config` | New: `SettingsPanel.tsx`, `routes.ts` | 4h | — |
| T3-02 | **Theme support** — Light/dark/colorblind modes via Tailwind theme switching | `tailwind.config.js`, `globals.css`, new: `ThemePicker.tsx` | 4h | — |
| T3-03 | **MCP server management** — Add/remove/configure MCP servers | New: `McpManager.tsx`, `routes.ts` | 4h | T2-13 |
| T3-04 | **Hook configuration** — View and edit hooks from web UI | New: `HookEditor.tsx`, `routes.ts` | 3h | — |
| T3-05 | **Session naming/rename** — Name sessions, `/rename` command | `RepoList.tsx`, `PromptInput.tsx`, `routes.ts` | 2h | — |
| T3-06 | **Continue last session (`-c`)** — "Continue" button in sidebar for most recent session | `RepoList.tsx` | 1h | — |
| T3-07 | **Fork session UI** — Fork button in conversation header (when SDK supports it) | `ConversationView.tsx`, `routes.ts` | 2h | SDK fork support |
| T3-08 | **`/export` conversation** — Export conversation as markdown/JSON | `PromptInput.tsx` | 2h | — |
| T3-09 | **`/init` CLAUDE.md wizard** — Initialize CLAUDE.md for a project | `PromptInput.tsx`, `routes.ts` | 3h | — |
| T3-10 | **`/memory` editor** — Edit CLAUDE.md / auto-memory from web | New: `MemoryEditor.tsx`, `routes.ts` | 3h | — |
| T3-11 | **Keyboard shortcut parity** — Alt+P (model), Alt+T (thinking), Alt+O (fast), Ctrl+L (clear) | Global keyboard handler | 3h | T1-05, T2-09 |
| T3-12 | **Prompt suggestions** — Grayed-out suggestions based on git/conversation context | `PromptInput.tsx` | 4h | — |
| T3-13 | **`/doctor` diagnostics** — Health check for SDK, JSONL, MCP, hooks | New: `DoctorPanel.tsx`, `routes.ts` | 3h | — |
| T3-14 | **`/stats` usage statistics** — Daily usage, streaks, top tools | New: `StatsPanel.tsx`, `routes.ts` | 3h | — |
| T3-15 | **Collaborative viewing** — Multiple users can view the same session in real-time | WebSocket room support, `server.ts` | 6h | — |
| T3-16 | **Active session indicator in sidebar** — Visual indicator of which session is receiving messages | `RepoList.tsx` | 2h | — |
| T3-17 | **Add Repo button** — Handler for adding new repo working directories | `RepoList.tsx` | 1h | — |
| T3-18 | **Empty state CTA** — Call-to-action when no sessions exist | `RepoList.tsx` | 1h | — |

**Total estimated: ~51h**

### Success Metrics

- [ ] Settings editable from web (model, theme, permissions, tools)
- [ ] Light mode and colorblind themes available
- [ ] MCP servers manageable from web UI
- [ ] Hooks viewable and editable
- [ ] >= 10 keyboard shortcuts functional
- [ ] Prompt suggestions appear based on context
- [ ] Conversation exportable as markdown
- [ ] Feature coverage >= 90% of applicable CLI features

---

## Summary

| Tier | Objective | Tasks | Estimated Hours | Current Status |
|------|-----------|-------|-----------------|----------------|
| **Tier 1** | Can Replace CLI | 9 tasks | ~24h | 0% (P1 blockers) |
| **Tier 2** | Better Than CLI | 18 tasks | ~47h | 60% (observability done, commands not) |
| **Tier 3** | Power User Features | 18 tasks | ~51h | 10% (session lifecycle partial) |
| **Total** | | 45 tasks | ~122h | |

### Priority Order

```
Tier 1 (blocks daily use) → Tier 2 (differentiator) → Tier 3 (completeness)
```

### Tier 1 Dependency Graph

```
T1-01 (tool results)     — independent
T1-02 (syntax highlight) — independent
T1-03 (/clear)           — independent
T1-04 (/compact)         — independent
T1-05 (/model)           — independent
T1-06 (permission mode)  — independent
T1-07 (allow for session)— independent
T1-08 (auto-compact)     → depends on T1-04
T1-09 (@ file mention)   — independent

8 of 9 tasks are independent → high parallelization potential
```
