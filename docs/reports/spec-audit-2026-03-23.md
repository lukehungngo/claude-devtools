# Spec Audit Report — Claude DevTools Dashboard

**Date:** 2026-03-23
**Spec:** `docs/plans/SPEC-claude-devtools-dashboard_v1.md`
**Auditor:** Claude Opus 4.6

---

## Panel 0: Top Status Bar

| Spec Requirement | Priority | Status | Notes |
|---|---|---|---|
| Row 1: title + spinner, tokens, mode, model, branch | P0 | ✅ Done | |
| Row 1 right: 24h/7d usage, subscription tier + usage % | P0 | ✅ Done | |
| Row 2: duration, context % bar (green→yellow→red), MCP count, tasks | P0 | ✅ Done | |
| Row 3: color-coded tool badges with counts | P0 | ✅ Done | |
| All values update in real-time (<500ms) | P0 | ⚠️ Partial | Polling-based, not true real-time push. Metrics only refresh on session re-select |
| Click tool badge → filter Agents Log | P1 | ✅ Done | `onToolFilter` wired |
| Click Token In/Out → cost breakdown modal | P1 | ❌ Not built | |

## Panel 1: Sidebar — Repositories & Sessions

| Spec Requirement | Priority | Status | Notes |
|---|---|---|---|
| List repos with name, branch, status dot | P0 | ✅ Done | |
| Expand repo → sessions (hash, events, agents, time) | P0 | ✅ Done | |
| Click session → load all panels | P0 | ✅ Done | |
| Active session highlighted | P0 | ✅ Done | |
| Add Repo button → folder picker | P0 | ❌ Not built | Button renders but no onClick handler |
| Filter tabs (active/archived/all) | — | ✅ Done | Added beyond spec |
| Collapse/expand sidebar | — | ✅ Done | Added beyond spec |
| Repo grouping by git root | P0 | 🐛 Bug | Worktree `.git` file not detected (only checks directories) |
| Drag-to-reorder repos | P1 | ❌ Not built | |
| Search/filter across repos and sessions | P1 | ❌ Not built | |
| Right-click context menu | P1 | ❌ Not built | |
| Empty state CTA | P0 | ❌ Not built | |

## Panel 2: Session Viewer & Command Dispatch

| Spec Requirement | Priority | Status | Notes |
|---|---|---|---|
| Rich structured blocks (tool calls, thinking, responses, errors, diffs) | P0 | ✅ Done | ToolCallBlock, ThinkingBlock, ResponseBlock, ErrorBlock |
| Replay mode (load from JSONL) | P0 | ✅ Done | |
| Live mode (WebSocket streaming via chokidar) | P0 | ✅ Done | `useEventStream` hook |
| Auto-scroll + scroll-lock + "↓" button | P0 | ✅ Done | requestAnimationFrame fix applied |
| Cost strip (tokens, cost, duration, session hash) | P0 | ✅ Done | CostStrip component |
| Command input (one-shot `claude -p`) | P0 | 🐛 Bug | fetch+getReader approach may still have issues in some browsers. Needs verification. |
| Collapsible event blocks | P1 | ✅ Done | Smart collapse: tools collapsed, responses expanded |
| Search within events (Ctrl+F) | P1 | ❌ Not built | |
| Click file paths → open in editor | P1 | ⚠️ Partial | Styled as clickable, but only logs to console (no `open` call) |
| Event type filter | P1 | ❌ Not built | |
| Side-by-side diff viewer for Edits | P2 | ❌ Not built | |
| Export session as HTML | P2 | ❌ Not built | |

## Panel 3: Agent Graph — Real-Time DAG

| Spec Requirement | Priority | Status | Notes |
|---|---|---|---|
| Nodes for each agent with type-colored borders | P0 | ✅ Done | indigo/cyan/yellow/green |
| Directed edges parent → child | P0 | ✅ Done | |
| Node shows: type, description, status | P0 | ✅ Done | |
| Running nodes pulse/animate | P0 | ✅ Done | CSS animation |
| Active edges dashed animation | P0 | ✅ Done | |
| Stats bar (agents, running, completed, cost, tokens) | P0 | ✅ Done | |
| Zoom controls (in/out/fit) | P0 | ✅ Done | |
| Click node → scroll/highlight log entries | P1 | ✅ Done | `selectedAgent` cross-panel state |
| Hover tooltip (agent ID, spawn time, tokens, cost) | P1 | ✅ Done | |
| Color legend | P1 | ✅ Done | |
| Lock layout toggle | P1 | ❌ Not built | |
| Graph handles 50+ nodes (<16ms) | P0 | ⚠️ Untested | No benchmark run |
| Minimap for 30+ nodes | P2 | ❌ Not built | |
| Collapse/expand sub-trees | P2 | ❌ Not built | |
| Time-travel slider | P2 | ❌ Not built | |

## Panel 4: Agents Log

| Spec Requirement | Priority | Status | Notes |
|---|---|---|---|
| 4-column grid: time, agent badge, message, action badge | P0 | ✅ Done | |
| Agent badges color-coded matching graph | P0 | ✅ Done | |
| Action badges for tool types | P0 | ✅ Done | |
| File refs clickable (cyan) | P0 | ✅ Done | |
| Auto-scroll + scroll-lock + "↓" button | P0 | ✅ Done | rAF fix applied |
| Filter tabs: All, Main, Explore, Plan, General, Errors, Tools | P0 | ✅ Done | |
| Shows ALL agent events (not just main) | P0 | ✅ Done | Server merges main+subagent events |
| Full-text search | P1 | ❌ Not built | |
| Click agent badge → isolate entries | P1 | ✅ Done | Via `onSelectAgent` |
| Click log → highlight graph node | P1 | ✅ Done | |
| Expandable entries | P1 | ❌ Not built | |
| Export log as JSON/JSONL | P1 | ❌ Not built | |
| Virtualized list (10K+ entries) | P0 | ⚠️ Partial | MAX_VISIBLE=500 cap, not true virtualization |

## Cross-Panel Interactions

| Interaction | Status |
|---|---|
| Select session → all panels | ✅ Done |
| Click graph node → highlight log | ✅ Done |
| Click log agent badge → highlight graph node | ✅ Done |
| Click tool badge (top bar) → filter log | ✅ Done |
| Filter by agent type → dim graph nodes | ❌ Not wired (log filters don't affect graph) |
| New JSONL event → all panels | ✅ Done (WebSocket) |
| Click event in viewer → highlight graph + scroll log | ❌ Not wired |
| Click file path → open in editor | ⚠️ Console.log only |

## Prerequisites & Setup Gate

| Requirement | Status |
|---|---|
| First-launch setup wizard | ❌ Not built |
| CLI validation (`which claude`) | ❌ Not built |
| Session directory validation | ❌ Not built |
| Authentication validation | ❌ Not built |
| Runtime re-validation (credential expiry, WS reconnect) | ⚠️ Partial — WS has auto-reconnect |

## Data Model

| Item | Status |
|---|---|
| SQLite session index | ❌ Not built (using in-memory FS scanning) |
| SessionEvent schema matches spec | ⚠️ Partial — our types use Claude's native JSONL format, not the spec's idealized schema |

---

## Summary Scorecard

| Category | P0 Done | P0 Total | P1 Done | P1 Total | P2 Done | P2 Total |
|---|---|---|---|---|---|---|
| **Top Bar** | 4/5 | 80% | 1/2 | 50% | — | — |
| **Sidebar** | 3/5 | 60% | 0/3 | 0% | — | — |
| **Session Viewer** | 5/6 | 83% | 1/4 | 25% | 0/2 | 0% |
| **Agent Graph** | 6/7 | 86% | 4/5 | 80% | 0/3 | 0% |
| **Agents Log** | 6/7 | 86% | 2/5 | 40% | — | — |
| **Cross-Panel** | 5/8 | 63% | — | — | — | — |
| **Setup Gate** | 0/4 | 0% | — | — | — | — |
| **TOTAL P0** | **29/42** | **69%** | | | | |

## Known Bugs

1. 🐛 **Worktree repo grouping** — `.git` file (worktree) not detected, only `.git` directory
2. 🐛 **Command dispatch** — fetch+getReader may still fail in some browser/proxy configurations
3. 🐛 **Real-time TopBar** — metrics don't auto-refresh when live events arrive, only on session re-select

## Biggest Gaps (by impact)

1. **Setup Gate** — 0% of P0. Spec says this is required before dashboard renders.
2. **Add Repo button** — P0 in spec, completely non-functional
3. **Empty state** — P0, no "get started" CTA
4. **Cross-panel viewer→graph/log linking** — clicking events in viewer doesn't highlight anything
5. **True virtualization** — log capped at 500 entries instead of handling 10K+
6. **SQLite persistence** — not built, using FS scanning (slower, no caching)

## Test Coverage

- **130 tests** passing (78 server + 52 dashboard)
- Server coverage: 97%+ lines on analyzer/parser/hooks modules
- Dashboard coverage: 100% on pure logic modules (cost.ts, normalizeContent.ts)
- Component tests limited to exported pure functions (eventsToLogEntries, aggregateLogEntries)

---

_Generated 2026-03-23. Next audit should be run after P0 gaps are addressed._
