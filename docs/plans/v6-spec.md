# Claude DevTools — v6 Specification
> Updated: 2026-04-15 | Ground truth: current codebase (master)

---

## Product Identity

**What it is:** A full web client that replaces Claude Code CLI, with built-in observability superpowers.

**Tagline:** "Everything the CLI does. Everything the CLI hides."

**Personas:**
- **Designer (Persona A):** Conversation is the entire product. Never opens the bottom panel.
- **AI-native engineer (Persona B):** Observability for multi-agent systems. Bottom panel is why they're here.

---

## What's Built (Verified Against Code)

### Core Layout

| Component | Status | Evidence |
|-----------|--------|----------|
| Right panel eliminated, full-width conversation | DONE | `Layout.tsx` — no right panel slot |
| Main panel: 3 tabs (Conversation, Raw Log, Agent Log) | DONE | `SessionPage.tsx` — `mainTab` state, 3 tabs rendered |
| Bottom panel: 3 tabs (Agent Graph, Tool Call, Cost) | DONE | `BottomPanel.tsx` — `BottomTab = "agent-graph" \| "tool-call" \| "cost"` |
| Bottom panel: 4th Tasks tab | DONE | `TasksTab.tsx` merged, 4th tab in BottomPanel |
| Sticky topbar with 7 metrics | DONE | `TopBar.tsx` — status/model/age/context/cost/agents/in+out tokens |
| Resizable bottom panel (drag + localStorage) | DONE | `BottomPanel.tsx` — `HEIGHT_KEY`, `COLLAPSED_KEY` |
| Auto-open bottom panel on SubagentStart | DONE | `BottomPanel.tsx` — 5s debounce, localStorage override |
| Turn history collapsible panel | DONE | `TurnHistoryPanel.tsx` + LayoutContext `turnHistoryOpen` |
| Light/dark/high-contrast theme system | DONE | `ThemeContext.tsx` + CSS `--bg`, `--acc`, etc. |

### Conversation Panel

| Feature | Status | Evidence |
|---------|--------|----------|
| Streaming text + tool calls + thinking | DONE | 20+ SSE event types handled |
| Tool call grouping (consecutive same-type) | DONE | `ToolEntries.tsx` — `groupedEntries` + `buildSemanticSummary()` |
| Collapsed-by-default tool entries | DONE | `ToolEntryRow` — collapsed unless error |
| Two-state progress (verb-ing / past-tense) | DONE | `PROGRESS_MAP` + pulse animation |
| "+N lines (click to expand)" | DONE | `ToolResultBlock` — collapses at 3 lines |
| Colored left border by tool type | DONE | `getToolBorderColor()` |
| Agent dispatch card (subagent) | DONE | `AgentCard.tsx` — tool stats, cost, duration |
| VerdictBanner (verdict first, details last) | DONE | `VerdictBanner.tsx` |
| NarrationGroup (pre-tool thinking text) | DONE | `NarrationGroup.tsx` |
| Turn dividers (T{n} badge, clickable) | DONE | `TurnDivider.tsx` |
| Turn selection syncs across all panels | DONE | `LayoutContext` propagates to Trace/RawLog/TopBar |
| "Viewing T{n}" pill in topbar | DONE | `ViewingTurnPill` in `TopBar.tsx` |
| Inline permission approve/deny | DONE | `PermissionBlock.tsx` |
| Question/answer blocks | DONE | `QuestionBlock.tsx` |
| Rewind menu | DONE | `RewindMenu.tsx` — SDK `rewindFiles()` + dry-run |
| Virtualized turn list | DONE | `@tanstack/react-virtual` in `ConversationView` |
| Incremental turn grouping | DONE | `groupEventsIntoTurnsIncremental()` — only rebuilds last turn |
| TurnCard layout: Narration → ToolEntries → response text | DONE | Merged to master |
| TaskGrid in TurnCard (dead code) | DONE | Wired in ConversationView.tsx via tasksByTurn |

### Topbar / Controls Zone (P5-01)

| Feature | Status | Evidence |
|---------|--------|----------|
| Read-only metrics display (DONE state) | DONE | `TopBar.tsx` — shows model/age/context/cost/agents/tokens |
| Permission mode cycling badge | DONE | `TopBar.tsx` — `cyclePermissionMode()` button |
| ControlsZone (LIVE state only) | DONE | `TopBar.tsx` line 138 — conditional on `isLive && onModelSelect` |
| Model switcher dropdown | DONE | `ModelSwitcher.tsx` — `ControlsZone` |
| Fast mode toggle | DONE | `FastModeToggle.tsx` — `ControlsZone` |
| Effort level slider | DONE | `EffortSlider.tsx` — `ControlsZone` |
| Context compact button | DONE | `ContextCompact.tsx` — `ControlsZone` |
| Controls wired to session in SessionPage | DONE | `useSessionControl` hook → `setSessionControl()` |
| WAIT state (amber dot, pending permission) | DONE | `TopBar.tsx` — `isWaiting = isLive && hasPermissionPending` |
| Red border on 80%+ context | DONE | `TopBar.tsx` — `contextDanger` outline |
| Last-used model shown (not first historical) | DONE | `modelsList[modelsList.length - 1]` (commit c9c9ed8) |

### Management Panels (Phase 2 Debt — NOW RESOLVED)

| Panel | Component | Backend | Accessible via | Status |
|-------|-----------|---------|----------------|--------|
| Settings | `SettingsPanel.tsx` (378 lines) | `/api/settings` | `PanelModal` + `/settings` slash cmd | DONE |
| Hooks | `HookEditor.tsx` (544 lines) | `/api/settings/hooks` | `PanelModal` + `/hooks` slash cmd | DONE |
| CLAUDE.md | `MemoryEditor.tsx` (203 lines) | `/api/sessions/{hash}/{id}/memory` | `PanelModal` + `/memory` slash cmd | DONE |
| Permissions | `PermissionRulesEditor.tsx` (213 lines) | `/api/settings/permissions` | `PanelModal` + `/permissions` slash cmd | DONE |
| MCP Servers | `McpManager.tsx` (397 lines) | `/api/mcp/*` routes | `PanelModal` + `/mcp` slash cmd | DONE |
| Agent Manager | `AgentManager.tsx` | `/api/agents` | `PanelModal` + `/agents` slash cmd | DONE |
| Doctor | `DoctorPanel.tsx` | health checks | `PanelModal` | DONE |
| Stats | `StatsPanel.tsx` | analytics | `PanelModal` | DONE |
| Permission History | `PermissionHistory.tsx` | in-memory | `PanelModal` + `"permission-history"` key | DONE |

> The `PanelModal` component (lazy-loaded, 90vw, 85vh, Escape-to-close) was built and wired into `SessionPage.tsx` at line 391. `handleOpenPanel` is no longer a no-op — it sets `activePanel` state. This fully resolves the Phase 2 orphan debt flagged in v5-plan.

### Bottom Panel Tabs

| Tab | Status | Evidence |
|-----|--------|----------|
| Agent Graph (Jaeger-style trace) | DONE | `TraceTab.tsx` — proportional bars, 3 columns |
| Tool Call (file-level detail) | DONE | `DetailTab.tsx` — agent badge, turn#, tool count, duration, cost |
| Cost (burn rate, projection, per-agent) | DONE | `CostTab.tsx` — 3 cards + per-agent bars |
| Tasks (TodoWrite task list) | DONE | `TasksTab.tsx` merged, 4th tab in BottomPanel |

### Server / Backend

| Feature | Status | Evidence |
|---------|--------|----------|
| cwd validation (existsSync + isDirectory) | DONE | Merged to master |
| 400 error for invalid cwd (not 500) | DONE | Merged to master |
| filterDagForTurn status-aware memoization | DONE | Merged to master |
| Session isolation fix in useEventStream | DONE | `useEventStream.ts` — `sessionIdRef` pattern (merged to master) |
| JSONL incremental byte-offset parsing | DONE | `parseJsonlIncremental()` |
| Stat-based session cache (mtime+size) | DONE | `SessionCache` |
| SDK model/effort/fastMode/compact controls | DONE | `session-routes.ts` — POST `/sessions/:id/model`, `/fast`, `/effort`, `/compact` |
| Permission history log | DONE | `PermissionHistory.tsx` + `PanelModal` |

### Session Control (P5)

| Feature | Status | Evidence |
|---------|--------|----------|
| Model switcher wired to SDK `setModel()` | DONE | `useSessionControl.ts` → `controlSetModel` |
| Fast mode toggle wired to SDK | DONE | `useSessionControl.ts` → `controlToggleFastMode` |
| Effort slider wired to SDK | DONE | `useSessionControl.ts` → `controlSetEffort` |
| Context compact button (one-click `/compact`) | DONE | `useSessionControl.ts` → `controlSendCompact` |
| Permission history log | DONE | `PermissionHistory.tsx` — shows all requests with decisions |
| Batch approve/deny | DONE | PermissionHistory.tsx — checkbox selection + batch action buttons |
| "Trust this tool for session" | DONE | PermissionBlock "Allow for session" button → usePermissions.decideSession |
| Fork session UI | DONE | /fork slash command + POST /api/sessions/:id/fork |
| Session templates | NOT STARTED | Deferred |
| Session comparison | NOT STARTED | Deferred |

### Sidebar & Session List

| Feature | Status | Evidence |
|---------|--------|----------|
| Repos with nested sessions | DONE | `RepoList.tsx` |
| Session truncated ID (8 chars) + hover=full | DONE | Commit 7d2bcd4 |
| Double-click to copy full session ID | DONE | Commit 7d2bcd4 |
| Green check after copy | DONE | Commit 24877ae |

---

## Architecture Baseline

These invariants are active and enforced in the current codebase:

1. **JSONL is source of truth** — `~/.claude/projects/` read-only. Never mutated by server.
2. **Byte-offset incremental parsing** — `openSync`/`readSync`, `newOffset = stat.size`.
3. **Fail-safe parsing** — per-line try/catch, malformed lines skipped.
4. **Metrics server-side** — `computeMetrics()` on server, dashboard receives pre-computed `SessionMetrics`.
5. **WS broadcasts only new events** — REST for full session history, WS for deltas only.
6. **SDK events via SSE** — active sessions stream from `query()` iterator directly.
7. **Promise-based permissions** — `canUseTool` resolves on user click, 10min timeout.
8. **O(1) per live event** — incremental turn grouping, cached restKeys Set, React.memo on TurnCard.
9. **Data integrity** — numbers match JSONL source. Live enrichment overlays REST metrics without replacing contextPercent (server-computed from SDK's actual window).
10. **Smooth UI/UX** — virtualized lists, batched RAF updates, stable refs, 60fps target.

---

## Gap Analysis

### PRs (All Merged)

**All PRs merged to master as of 2026-04-15.**

| Gap | Branch | Status |
|-----|--------|--------|
| filterDagForTurn status memoization bug | `fix/auto-bug-diagnosis` | Merged |
| cwd validation (existsSync + isDirectory) | `fix/auto-bug-diagnosis` | Merged |
| 400 error routing for cwd failures | `fix/auto-bug-diagnosis` | Merged |
| Tasks tab in bottom panel | `feature/queue-task-tab` | Merged |
| TurnCard layout (ToolEntries before msg-text) | `feature/reorder-conv-layout` | Merged |

### Phase 5 Gaps (Partially Implemented)

| Feature | Status | Gap |
|---------|--------|-----|
| P5-02: Batch approve/deny permissions | DONE | PermissionHistory.tsx |
| P5-02: "Trust tool for session" | DONE | PermissionBlock + usePermissions |
| P5-03: Fork session | DONE | /fork command |
| P5-03: Session templates | NOT STARTED | Deferred |

### Phase 6–8 Gaps (Not Started)

| Feature | Status |
|---------|--------|
| P6-01: Decision trace (thinking → tool choice linkage) | NOT STARTED |
| P6-02: Turn snapshots with time travel diff | NOT STARTED |
| P6-03: Spending view (cross-session cost) | NOT STARTED |
| P7-01: Session health monitor (stuck agent detection) | NOT STARTED |
| P7-02: Cross-session analytics | NOT STARTED |
| P7-03: Performance profiling dashboard | NOT STARTED |
| P8-01: Agent-first mode (layout flip) | NOT STARTED |
| P8-02: Task decomposition view | NOT STARTED |
| P8-03: Workflow templates | NOT STARTED |

### Slash Command Gaps (from gap-matrix.md — all resolved)

| Command | Previous Gap | Status |
|---------|-------------|--------|
| /diff | ~~Line-by-line only~~ | **DONE** — server returns unified diff |
| /rename | ~~localStorage only~~ | **DONE** — server calls SDK renameSession() |
| /bug | ~~Not implemented~~ | **DONE** — opens GitHub issues page |

### Dead Code

| Item | Location | Issue |
|------|----------|-------|
| `TaskGrid.tsx` | `dashboard/src/components/conversation/TaskGrid.tsx` | **RESOLVED** — TaskGrid wired via tasksByTurn in ConversationView |

---

## New Capabilities Beyond v5-Plan

These were built after v5-plan was written:

| Capability | What it does | Where |
|------------|--------------|-------|
| PanelModal system | Modal container for all 9 management panels. Lazy-loaded, keyboard-accessible, Escape-to-close. Resolves Phase 2 orphan debt entirely. | `PanelModal.tsx` + `SessionPage.tsx` |
| Permission History panel | Shows all permission requests with approve/deny decisions, timestamps, tool names, session context. | `PermissionHistory.tsx` |
| ControlsZone | Real-time controls (model/fastMode/effort/compact) shown in topbar ONLY during LIVE sessions, replaced by read-only metrics when done. | `controls/ControlsZone.tsx` |
| Session ID copy UX | Truncated 8-char ID in sidebar, hover shows full, double-click copies, green check confirmation tick. | `RepoList.tsx` + commits 7d2bcd4, 24877ae |
| Session isolation guard | `sessionIdRef` in `useEventStream` — WS events with mismatched session ID are dropped, preventing cross-session bleed. | `useEventStream.ts` |
| `computeLiveMetrics()` | Client-side live metrics overlay — enriches REST metrics with real-time tokens/cost/models during streaming without full REST refetch. contextPercent intentionally excluded (server-computed). | `lib/cost.ts` + `SessionPage.tsx` |
| Incremental turn grouping | `groupEventsIntoTurnsIncremental()` only rebuilds the last turn on new events — O(1) per event for long sessions. | `lib/turnSnapshot.ts` |
| Tasks tab (pending merge) | TodoWrite task extraction from session events, displayed in bottom panel 4th tab with count badge, progress counter, status icons. | `feature/queue-task-tab` |

---

## Next Priorities

### P1 — Active Development

1. **Spending View (P6-03)** — Cross-session cost visibility. High value for both personas. Uses existing `discoverSessions()` + session cost data already available in REST API.

2. **Decision trace (P6-01)** — Link thinking blocks to subsequent tool choices. Foundation exists in `ThinkingGroup` + `ToolEntries`. Needs correlation logic in DAG builder.

3. **Turn snapshots with time travel diff (P6-02)** — Snapshot file state at each turn boundary, diff between any two turns.

### P2 — Next Quarter

4. **Session health monitor (P7-01)** — Stuck agent detection. Requires server-side timer on agent span events. Can be surfaced as a topbar warning badge.

5. **Cross-session analytics (P7-02)** — Aggregate metrics across sessions for usage trends and cost patterns.

6. **Performance profiling dashboard (P7-03)** — Per-session and per-agent latency breakdown.

7. **Customizable keybindings** — Currently hardcoded in `useKeyboardShortcuts.ts`. Allow user-defined key mappings.

### P3 — Future

8. **Agent-first mode layout flip (P8-01)** — After P6-P7 are complete.

9. **Task decomposition view (P8-02)** — After agent-first mode.

10. **Workflow templates (P8-03)** — After agent-first mode.

11. **Session templates** — Deferred, no current demand.

12. **Session comparison** — Deferred, no current demand.

---

## Deferred (Not in Scope)

| Feature | Reason |
|---------|--------|
| Collaborative multi-user viewing | Complex WebSocket rooms — future project |
| Voice dictation | Browser Speech API — separate effort |
| Plugin marketplace | Depends on Anthropic plugin distribution stability |
| /batch parallel changes | Complex orchestration |
| /loop scheduled tasks | Low demand |
| P8: Agent-first mode layout flip | After P6-P7 are done |
| P8: Workflow templates | After agent-first mode |

---

## Verdict

**REVISE**

The codebase is coherent with the stated goals and architecturally sound. Phase 4 (UI Revamp) and Phase 5 Control are substantially complete. The Phase 2 orphan debt is fully resolved (PanelModal system is live and wired). However, three PRs (#19, #20, #21) contain confirmed bug fixes and complete features that are not yet in master — including a known data-correctness bug in Agent Graph (filterDagForTurn). The v6-spec should be adopted as the new baseline, and the three PRs should be merged as the immediate next action before starting any new work.

### Remediation Tasks

1. **Merge PR #19** — Addresses confirmed Agent Graph data bug + server robustness (cwd validation). No new features, pure fixes.
2. **Merge PR #20** — Conversation layout order fix. Low risk, improves readability.
3. **Merge PR #21** — Tasks tab. Feature-complete with 5 tests. Adds P8-02 seed (task decomposition observability).
4. **Fix or delete TaskGrid** — Dead code in master. If kept, wire `extractTasks(turnEvents)` into `TurnCard` props via `ConversationView`.
5. **Update gap-matrix.md** — Reflect that Phase 2 orphan panels are now accessible via PanelModal. PermissionHistory is a new panel not in the original gap matrix.
