# Claude DevTools — Plan v5

**Supersedes:** `v4-master-plan.md`, `v4-redesign-plan.md`, `v4-plan-delta.md`
**Date:** 2026-04-01
**Status:** Active

---

## Product Identity

**What it is:** A full web client that replaces Claude Code CLI, with built-in observability superpowers.

**Tagline:** "Everything the CLI does. Everything the CLI hides."

**Chrome analogy:** Conversation is Chrome (where you spend 90% of your time). Trace/Cost/Debug is Chrome DevTools (the bottom panel you open when you need superpowers).

---

## Two Personas, One Product

### Persona A: The designer (non-technical user)
- Never opened a terminal. Company told them to use Claude Code.
- Conversation IS the entire product. Never opens the bottom panel. That's fine.

### Persona B: The AI-native engineer
- Ran Claude Code CLI daily for months. Needs observability for multi-agent systems.
- Cost awareness matters. Debugging agent failures is a real workflow.
- Conversation is the input method. The DevTools panel is why they're here.

### Design principle
The UI adapts to the situation, not the user. Same person may be Persona A on a quick prompt and Persona B on a 7-agent debug session. Bottom panel auto-opens on first `SubagentStart`. Manual overrides persist to localStorage.

---

## Layout Architecture

```
┌────────────┬──────────────────────────────────────┐
│            │ ●LIVE │ Model │ 37m │ 35% │ $580 │ 7 │  ← sticky topbar (HUD)
│  Sidebar   ├──────────────────────────────────────┤
│            │                                      │
│  Connection│  Conversation (FULL WIDTH)            │
│  Auth      │  Turn dividers (T170, T171)          │
│  Usage     │  User messages + Claude responses     │
│            │  Tool call previews (inline grouped)  │
│  Repos     │  Permission prompts (inline)          │
│   └Sessions│                                      │
│            │  [prompt input ________________] Send │
│            ├══════════════════════════════════════┤ ← resizable divider
│            │ [Agent Graph][Tool Call][Raw Log]     │ ← bottom panel
│            │ [Cost]                               │   (collapsed by default)
│            │                                      │
└────────────┴──────────────────────────────────────┘
```

### Key layout decisions
- **No right panel.** Everything moves to bottom panel tabs.
- Conversation gets full width of main area (minus sidebar).
- Bottom panel starts collapsed (tab bar visible, ~28px). Auto-opens on first `SubagentStart`.
- HUD is a sticky topbar docked to top of conversation area (not floating).
- Sidebar is the only persistent side element.

---

## Turn System

**Turn is the heartbeat of the entire app. Everything syncs to it.**

### Turn visibility per component

| Component | Turn visibility | Why |
|-----------|----------------|-----|
| Conversation | Yes — subtle divider with turn number (T170, T171) | You need to know where one cycle ends and the next begins |
| Topbar | Yes — clickable, jumps to latest | Free value on existing element |
| Agent Graph | No — keep time axis only | Turns don't map to agent spans. An agent can span 40 turns. 171 tick marks = noise |
| Raw Log | Yes — group by turn (collapsible) | Most value here. "Turn 171 (3 events)" instead of 500 flat events |
| Tool Call | Subtle — turn number in header | Metadata: "Turn 171 → SWE → Read x4" |

### Turn selection behavior

**Click Turn 170 in conversation:**
- Agent Graph switches to Turn 170's agent hierarchy
- Raw Log scrolls to / filters Turn 170 events
- Tool Call clears (until you click a specific tool)
- Topbar shows session stats + small "viewing T170" indicator

**Click "back to live" or session advances:**
- Agent Graph snaps back to following latest turn
- Raw Log resumes auto-scrolling

---

## Component Specs

### 1. Sticky Topbar (Mission Control)

**Position:** Docked to top of conversation panel, sticky. **Height:** 36-40px.

```
┌──────────────────────────────────────────────────────────────────┐
│ ●LIVE │ MODEL    │ DURATION │ CONTEXT       │ COST  │ AGENTS │ IN   OUT │
│       │ Opus 4.6 │ 37m      │ 35% ████░░░░ │ $580  │ 7      │ 18K  350K│
└──────────────────────────────────────────────────────────────────┘
```

| State | Indicator | Border |
|-------|-----------|--------|
| Live session | Green pulsing dot, "LIVE" | Normal |
| Context danger (80%+) | Green dot | Red border, context % red |
| Session ended | Gray static dot, "DONE" | Normal |
| Waiting | Amber pulsing dot, "WAITING" | Normal |

Color coding: Live=green, Cost=amber, Context bar: green(0-50%) → amber(50-80%) → red(80%+), Tokens In=teal, Out=purple.

### 2. Left Sidebar (Global State)

**Width:** ~210-220px. Three sections:

**Section 1: Connection + Auth** — Claude Code connection status, plan tier badge.

**Section 2: Usage (7-day, account-level)** — Session limit, rate limit (5h), total in/out. Progress bars green→amber→red.

**Section 3: Repositories with nested Sessions** — Repos as parents, sessions as children. Green dot=active, gray=historical. Cost + time per session.

### 3. Conversation Panel (Main Viewport)

**90% of time spent here.** Must be best-in-class chat experience.

Message types: user messages, assistant text (streaming markdown), tool call previews (inline collapsed cards), permission prompts (inline approve/deny), thinking blocks (collapsible), error states, system messages.

**Tool call rendering:** Grouped by consecutive same-type. Errors always shown individually. Click opens Detail in bottom panel.

```
┌─────────────────────────────────────┐
│ ✓ Read x12 files  ·  2m 14s        │
│ ✓ Edit x8 files   ·  4m 02s        │
│ ✗ npm test         ·  3 failures    │
│ ✓ npm test         ·  all pass      │
└─────────────────────────────────────┘
```

**Turn dividers:** Subtle separator between turns with turn number. Click to select (syncs Agent Graph, Raw Log, Tool Call).

#### UI-18: Enhanced Conversation Response Rendering

Redesign conversation response blocks to match Claude Code CLI's real UX patterns. The core philosophy: **collapsed-by-default, semantic summary line, expand-on-demand, progress states, group similar ops.**

##### Principle 1: Collapsed-by-default with semantic summary

Every tool call renders as a single summary line. No raw output visible until expanded.

```
┌────────────────────────────────────────────┐
│ ▸ Read 6 files                    2m 14s   │  ← collapsed (default)
│ ▸ Grep "validateEmail"            0.3s     │
│ ▸ Edit 3 files                    1m 02s   │
│ ▾ Bash npm test                   4.2s     │  ← expanded
│   ✓ 712 tests passed                       │
│   +38 lines (click to expand)              │
│ ✗ Bash npm run build              12.1s    │  ← error always shown
│   Error: Module not found './utils'        │
└────────────────────────────────────────────┘
```

Summary line format: `{icon} {ToolName} {semantic description} · {duration}`

| Tool | Collapsed summary | Notes |
|------|------------------|-------|
| Read | `Read 6 files` | Count badge for consecutive groups |
| Grep | `Grep "pattern"` | Pattern in quotes per CC changelog |
| Edit | `Edit 3 files` | Count badge |
| Write | `Write path/to/file.ts` | Individual |
| Bash | `Bash npm test` | Command shown, not output |
| MCP | `Queried {server}` | Per CC changelog for MCP tools |
| ls/tree | `Listed N directories` | Semantic per CC changelog |

##### Principle 2: Two-state progress (verb-ing -> past tense)

| State | Display | Style |
|-------|---------|-------|
| Active | `Reading...` / `Searching...` / `Running...` | Animated spinner, muted text |
| Complete (success) | `Read` / `Searched` / `Ran` | Check icon, normal text |
| Complete (error) | `Failed` | X icon, red text, auto-expanded |

##### Principle 3: Consecutive same-type grouping

6 consecutive Reads become one `Read 6 files` group with count badge. This is the single biggest compaction win. Already partially implemented in `ToolEntries.tsx` — enhance with:
- Semantic summary (not just "Read x6")
- File list visible on expand
- Total duration for the group

##### Principle 4: "+N lines (click to expand)"

For tool outputs longer than 3-5 visible lines:
```
Bash npm test
  ✓ 712 tests passed
  ... +38 lines (click to expand)
```
Mirrors CC's `+11 lines (ctrl+o to expand)` pattern. Click expands inline. Expanded state is per-block, not global.

##### Principle 5: Colored left border = message type

Thin (3px) left border color-codes each block type. More visible than CC's subtle colored dots.

| Block type | Border color | Variable |
|------------|-------------|----------|
| Read/file ops | `--teal` | Blue-green |
| Search (Grep/Glob) | `--purple` | Purple |
| Bash/command | `--amber` | Yellow |
| Edit/Write | `--green` (success) | Green |
| Error | `--red` | Red |
| Thinking | `--t3` | Muted gray |
| Agent dispatch | `--acc` | Terracotta accent |

##### Principle 6: Agent dispatch = subagent card

When Claude spawns a subagent (Task/Agent tool), render a compact card:

```
┌─ S1 Engineer ──────────────────────────────┐
│  "Implement validation for email input"     │
│  ▸ 12 tool calls · 2m 34s · $0.42         │
│  Status: ✓ completed                        │
└────────────────────────────────────────────┘
```

- Icon + name from trace span colors
- Task description (first line of prompt)
- Collapsed stats: tool count, duration, cost
- Click expands to show sub-tool-calls
- Click agent name jumps to Agent Graph tab for this span

##### Principle 7: Verdict first, details last

For assistant responses with a conclusion (e.g., after running tests, completing a task):
- Final summary/verdict line is always visible at top of the response
- Tool call details are below, collapsed
- Progressive disclosure: summary -> tool groups -> individual outputs -> raw lines

##### Implementation notes

- Builds on existing `ToolEntries.tsx` grouping (UI-14)
- Requires new `CollapsedToolBlock` component (replaces current inline tool rendering)
- `AgentCard` component for subagent dispatch rendering
- Border colors via CSS classes: `.tool-border-read`, `.tool-border-search`, etc.
- Expand/collapse state stored per-block in local component state (not context)
- Error blocks: always expanded, never collapsed (safety)

### 4. Bottom Panel (DevTools)

**Default:** Collapsed (~28px tab bar). **Open:** Resizable via drag, remembers height.
**Auto-open trigger:** First `SubagentStart` event. Respects manual override (localStorage + 5s debounce).

#### 4 Tabs

**Tab 1: Agent Graph** — Jaeger-style distributed trace with nesting.
- Default: 3 levels deep (Orchestrator → children → sub-agents). Tool calls hidden until click.
- Row sizing: Agents=48px, Tool calls=26px compact.
- **Proportional bars, text outside.** Bar width = actual duration relative to the turn. No min-width. Duration + cost as labels to the right (Chrome DevTools network tab style).
- Parallel agents: same indent level, bars overlap on time axis, bracket groups them.
- Time axis: full width minus label column. Grid lines every ~5min.
- Grouping: consecutive same-type tool calls collapse ("Read x12").
- Live: running agents show pulsing amber dot, bar extends.
- **Turn-scoped:** Shows one turn at a time, defaults to latest, auto-advances live.
- Resizable label column.

**Tab 2: Tool Call** — File-level breakdown of selected span.
- Header: agent icon + name + tool type + file count + duration + cost
- Shows turn number: "Turn 171 → SWE → Read x4"
- Rows: file path (monospace) + line count + status badge (read/changed/created/error)
- Triggered by clicking span in Agent Graph OR tool call card in Conversation

**Tab 3: Raw Log** — Full JSON payload with syntax highlighting.
- Keys=blue, strings=green, numbers=amber. Monospace, pre-wrapped.
- **Grouped by turn (collapsible):** "Turn 171 (3 events), Turn 170 (18 events)"
- Syncs to selected turn.

**Tab 4: Cost** — Session-level cost intelligence.
- Three metric cards: session cost (amber), burn rate ($/min + trend), projected total
- Per-agent breakdown: icon + name + proportional bar + cost + percentage

### 5. Spending View (Future — Top-level Tab)

Cross-session, account-level. Weekly spend, daily bar chart (7d/30d/All), budget tracker, session cost comparison table.

---

## Color System

### Theme strategy
- **Light mode default.** Matches Claude Desktop. Dark mode is a toggle. Persists in localStorage.
- CSS custom properties. Theme switch toggles `data-theme="dark"`.
- Warm undertone in both modes. Terracotta accent is the brand.

### Light mode (default)

| Role | Token | Value |
|------|-------|-------|
| Background primary | `--bg` | `#F7F5F0` |
| Background surface | `--bg-surface` | `#EFECE4` |
| Background elevated | `--bg-elevated` | `#FFFFFF` |
| Background hover | `--bg-hover` | `#E8E5DC` |
| Border | `--border` | `#E5E1D8` |
| Text primary | `--text-1` | `#2C2B28` |
| Text secondary | `--text-2` | `#6B665D` |
| Text muted | `--text-3` | `#8B8780` |
| Accent | `--accent` | `#C2592E` |

### Dark mode

| Role | Token | Value |
|------|-------|-------|
| Background primary | `--bg` | `#2B2A27` |
| Background surface | `--bg-surface` | `#353431` |
| Background elevated | `--bg-elevated` | `#3D3C38` |
| Background hover | `--bg-hover` | `#474642` |
| Border | `--border` | `#4A4944` |
| Text primary | `--text-1` | `#EEECE8` |
| Text secondary | `--text-2` | `#A8A49D` |
| Text muted | `--text-3` | `#6F6C66` |
| Accent | `--accent` | `#D97757` |

### Shared semantic colors (both themes)

| Role | Variable | Value |
|------|----------|-------|
| Success | `--green` | `#5DB86C` |
| Warning/cost | `--amber` | `#D4A03E` |
| Danger/error | `--red` | `#D9534F` |
| Info/tokens in | `--teal` | `#4BA8A8` |
| Tokens out | `--purple` | `#B08CDB` |

### Agent span colors, tool call colors, typography
See `v4-redesign-plan.md` for full tables (still canonical).

---

## Phase History (Complete)

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 0 | Fix broken (SSE forwarding, image paste, fast mode, diff) | **DONE** |
| Phase 1 | Use SDK properly (setModel, setPermissionMode, rewindFiles, MCP) | **DONE** |
| Phase 2 | Config & management (permissions editor, CLAUDE.md, hooks, MCP, settings) | **DONE** |
| Phase 3 | Full parity (background tasks, output styles, keyboard, /agents, search) | **DONE** (~92%) |
| Phase 3.5 | Audit fixes (9 issues: 2 P1 fixed, 7 P2/P3 absorbed into UI revamp) | **P1s DONE** |

### Inventory at Phase 3.5 completion

| Asset | Count |
|-------|-------|
| Tests | 1046 (407 server + 639 dashboard) |
| Source files | 216 (.ts/.tsx) |
| React components | 45 |
| API endpoints | 40+ |
| Keyboard shortcuts | 10 |
| Slash commands | 33 |
| SDK methods used | 9/15 |
| SSE event types | 20+ |

---

## Phase 4: UI Revamp — "The Layout That Scales"

The v4 master plan had "UI Revamp → NEXT" as vague. This phase is the concrete implementation — it absorbs 7 Phase 3.5 audit fixes + 8 Phase 4-7 features.

### OKR

**Objective:** Establish the layout architecture that supports Phases 5-8 without future rewrites.

| Key Result | Target | Metric |
|------------|--------|--------|
| KR1: Right panel eliminated | Done | Conversation gets full main width |
| KR2: Bottom DevTools panel | 4 tabs working | Agent Graph, Tool Call, Raw Log, Cost |
| KR3: Sticky topbar | 7 metrics live-updating | Status, model, duration, context, cost, agents, tokens |
| KR4: Turn system | Cross-component sync | Turn dividers, selection syncs graph+log+detail |
| KR5: Trace bars proportional | No min-width | Bar width = actual duration, text outside |
| KR6: Auto-open behavior | Implemented | Panel opens on SubagentStart, respects manual override |

### Implementation tasks

| # | Task | Status | Gaps | Absorbs |
|---|------|--------|------|---------|
| UI-01 | Kill right panel, conversation full-width | **DONE** | — | A-03 |
| UI-02 | Bottom panel container with 4 tabs | **DONE** | Height + collapsed state persisted to localStorage; default collapsed on first visit | — |
| UI-03 | Agent Graph tab (Jaeger-style trace) | **DONE** | 48px/26px row heights, 3-level depth limit with toggle, tool calls hidden by default | P5-01, P7-01 |
| UI-04 | Tool Call tab (file-level breakdown) | **DONE** | Header bar: agent badge, T{n}, primary tool x count, duration, cost | P5-03 |
| UI-05 | Raw Log tab (JSON syntax highlight) | **DONE** | — | — |
| UI-06 | Cost tab (burn rate, projection, per-agent) | **DONE** | 3 cards: session cost, burn rate with trend arrow, projected total | P5-02 |
| UI-07 | Sticky topbar with 7 metrics | **DONE** | WAIT state (amber dot), red outline on 80%+ context | P4-01 |
| UI-08 | Light/dark theme system | **DONE** | Bonus: high-contrast theme | A-08 |
| UI-09 | Auto-open on SubagentStart + localStorage | **DONE** | — | — |
| UI-10 | Proportional trace bars, text outside | **DONE** | 0.3% min-width for visibility, proportional positioning | — |
| UI-11 | Turn dividers in conversation | **DONE** | — | — |
| UI-12 | Turn selection syncs across components | **DONE** | — | — |
| UI-13 | Raw Log grouped by turn (collapsible) | **DONE** | — | — |
| UI-14 | Tool call grouping (consecutive same-type) | **DONE** | Click-to-detail wired via openBottomTabRef | P5-03 |
| UI-15 | "Viewing T170" indicator in topbar | **DONE** | — | — |
| UI-16 | Absorb A-05 (code splitting) during rewrite | **DONE** | Route-level + vendor chunks + lazy BottomPanel | A-05 |
| UI-17 | Absorb A-06 (conversation memory) | **DONE** | TurnSnapshot uses startIndex/endIndex, no duplication | A-06 |
| UI-18 | Enhance conversation response rendering | **DONE** | See UI-18 sub-status below | — |
| UI-19 | Raw Log time-descending sort | **DONE** | — | — |

### What was DROPPED

| Item | Reason |
|------|--------|
| Sankey diagram (old P5-01) | Trace chart + cost tab serve same purpose better |
| DAG as primary view (old P7-01) | Replaced by trace chart in bottom panel |
| Keyboard-first (old P3-03) | Monitoring tool, not code editor |
| Hardcoded dark-only theme | Replaced by light/dark toggle |
| 6 bottom tabs → 4 | History + Live merged; Detail renamed Tool Call |

---

## Phase 5: Control — "Command Your Agents"

(Formerly Phase 4 in v4 master plan. Renumbered because UI Revamp took the Phase 4 slot.)

### OKR

**Objective:** Users can control every aspect of agent execution in real-time.

| Key Result | Target | Metric |
|------------|--------|--------|
| KR1: Live controls | 5+ | Real-time actions during streaming |
| KR2: Mode switching latency | <100ms | Click to SDK mode change |
| KR3: Multi-agent control | Implemented | Per-agent cancel, inspect |

### Features

#### P5-01: Command Center — Controls Zone
Split from old P4-01. Topbar is read-only metrics (done in Phase 4). This adds write controls:
- Permission mode selector (dropdown with descriptions)
- Model switcher (dropdown, current + recent)
- Fast mode toggle
- Effort level slider (low/medium/high/max)
- Context gauge with one-click compact
- All changes via SDK mid-stream

#### P5-02: Agent Orchestration Controls
Per-agent controls in Trace tab / Tool Call tab:
- Cancel individual agents (`query.stopTask()`)
- Inspect agent context (events, tools, cost)
- Action buttons in Tool Call tab header, not on trace chart

#### P5-03: Live Permission Dashboard
- Permission history log
- Batch approve/deny
- "Trust this tool for this session"
- Permission analytics (which tools ask most → suggest rules)

#### P5-04: Session Lifecycle Controls
- Fork session
- Session templates
- Session comparison
- Batch operations

---

## Phase 6: Visibility & Traceability — "See Everything"

(Formerly Phase 5 in v4 master plan.)

### OKR

**Objective:** Every token, decision, and cost is visible and traceable.

### Features

#### P6-01: Decision Trace — "Why Did Claude Do That?"
- Link thinking blocks to subsequent tool calls
- Show decision tree: thinking → tool choice → result → next thinking
- Thinking contradiction detection
- Sub-agent delegation reasoning

#### P6-02: Turn Snapshots with Time Travel
- Full state reconstruction at any turn
- Diff between any two snapshots
- "What changed between turn 5 and turn 12?"
- Rewind to snapshot and fork

#### P6-03: Spending View (Cross-Session Cost)
- Weekly total spend (large number)
- Daily bar chart (7d/30d/All toggle)
- Budget tracker with progress bar
- Session cost comparison table (sortable)

---

## Phase 7: Observability — "Know Before It Breaks"

(Formerly Phase 6 in v4 master plan.)

### Features

#### P7-01: Session Health Monitor
- Agent stuck detection (no events for >30s)
- Error rate tracking
- Estimated time/cost remaining

#### P7-02: Cross-Session Analytics
- Tool usage patterns across sessions
- Model performance comparison
- "Most expensive/efficient sessions"
- Weekly/monthly reports

#### P7-03: Performance Profiling
- SSE latency monitoring
- Tool execution time breakdown
- Cache effectiveness tracking
- Memory usage tracking

---

## Phase 8: Abstraction — "Think in Agents, Not Messages"

(Formerly Phase 7 in v4 master plan. Reworked per delta.)

The layout doesn't flip. The bottom panel **graduates** to become the primary workspace:

- **Phase 5-6 state:** Panel collapsed by default, auto-opens for multi-agent. 70/30 split.
- **Phase 7 state:** Engineers keep panel open permanently. 50/50 split.
- **Phase 8 state:** "Agent-first mode" toggle. Trace/agent view = top half, conversation = bottom half. Same components, different arrangement.

### Features

#### P8-01: Agent-First Dashboard
Toggle/preference that flips which half is primary. Same components, different arrangement.

#### P8-02: Task Decomposition View
Visual task tree (from TodoWrite/TaskCreate events), dependencies, progress tracking, resource allocation.

#### P8-03: Workflow Templates
Save orchestration patterns, reusable workflows, custom agent configs per step, share between projects.

---

## Current Progress Evaluation (2026-04-01, updated)

### What's DONE (verified against codebase)

| Feature | Evidence |
|---------|----------|
| Right panel eliminated, full-width conversation | `right-panel/` deleted, `Layout.tsx` has no right panel slot |
| Bottom panel with 4 tabs | `BottomPanel.tsx` — Agent Graph, Tool Call, Raw Log, Cost |
| Sticky topbar with 7 metrics | `TopBar.tsx` — status, model, duration, context%, cost, agents, in/out tokens |
| Light/dark/high-contrast themes | `ThemeContext.tsx` + CSS custom properties + `data-theme` toggle |
| Jaeger-style trace spans | `TraceTab.tsx` — hierarchical, color-coded, 3 resizable columns (Agent/Duration/Cost) + waterfall |
| General agent icon derivation | `getSpanIcon()` derives 2-char abbreviation from any agent type string (hyphenated, camelCase, single-word). Hover tooltip shows full type name. Hash-based color palette for unknown agent types. |
| Proportional trace bars, text outside | `computeBarPosition()` proportional bars; Duration/Cost in separate columns, not inside bars |
| Turn dividers in conversation | `TurnDivider.tsx` — T{n} badge, clickable, visual selected state |
| Turn selection cross-component sync | LayoutContext propagates to TraceTab, RawLogTab, TopBar indicator; back-to-live on new turns |
| Raw Log grouped by turn + time-descending | `RawLogTab.tsx` — collapsible turn groups, latest-first sort in both Events and JSON modes |
| "Viewing T170" indicator | `ViewingTurnPill` in TopBar — accent pill + dismiss button |
| Tool call grouping | `ToolEntries.tsx` — consecutive same-type collapsed, errors individual |
| Auto-open on SubagentStart | `BottomPanel.tsx` — 5s debounce, localStorage persistence, switches to agent-graph tab |
| Cost tab with per-agent breakdown | `CostTab.tsx` — session cost, burn rate, per-agent proportional bars |
| Code splitting | Route-level lazy loading (TanStack Router), `React.lazy` for BottomPanel, vendor chunks |
| Memory optimization | TurnSnapshot uses `startIndex`/`endIndex` into shared array, no event duplication |
| Sidebar with repos + sessions | `RepoList.tsx` — connection, usage, repos with nested sessions |
| Virtualized turn list | `@tanstack/react-virtual` in ConversationView |
| Root node aggregate cost | `aggregateCost()` recursive sum of all descendant costs |
| Turn history descending sort | `TurnHistoryPanel.tsx` — most recent turn appears first, index arithmetic (O(1) memory) |
| CostFooter redesigned | 3-tier display: total only / total + agent count / total + main + agents breakdown. Floating-point threshold (0.0001) prevents "$0.0000" noise. |
| Inline code lightweight styling | `markdownComponents.tsx` — no background, mono font + semantic color via `classifyInlineCode()`. Works in both light/dark mode. |
| NarrationGroup Tailwind migration | Inline styles replaced with `dt-*` token Tailwind classes |
| DetailTab agent header | Header bar with agent badge icon, turn number, primary tool + count, duration, cost |

### UI-18 Sub-Status (Conversation Response Rendering)

Reflect evaluation (2026-04-01) — verdict: **DONE**

| Principle | Status | Detail |
|-----------|--------|--------|
| P1: Collapsed-by-default + semantic summary | **DONE** | `ToolEntryRow` collapsed unless error, `buildSemanticSummary()` matches spec |
| P2: Two-state progress (verb-ing → past tense) | **DONE** | `PROGRESS_MAP` + pulsing animation |
| P3: Consecutive same-type grouping | **DONE** | Groups work; tool-specific badge colors via `getToolBadgeColors()` |
| P4: "+N lines (click to expand)" | **DONE** | `ToolResultBlock` collapses at 3 lines |
| P5: Colored left border = message type | **DONE** | Tool borders use `getToolBorderColor()`; ResponseBlock uses `border-dt-accent` (brand color) |
| P6: Agent dispatch = subagent card | **DONE** | AgentCard with tool stat badges, cost, duration, nested content on expand |
| P7: Verdict first, details last | **DONE** | `VerdictBanner` renders before tool entries |

Additional components: VerdictBanner ✓, FindingBanner ✓, ProgressBar ✓, CostFooter ✓ (redesigned: clean minimal format with 3-tier display logic), ExpandHint ✓, TaskGrid (dead code — no data source)

### Honest Assessment

**Phase 4 (UI Revamp) is 100% complete.** 19 of 19 tasks DONE. Verified via Playwright on 2026-04-01.

| Area | Completion | Confidence |
|------|------------|------------|
| Layout (right panel killed) | 100% | High — fully deleted, zero traces |
| Turn system (dividers, sync, indicator) | 100% | High — all visual elements + cross-component sync + descending turn history |
| Code splitting | 100% | High — route-level + component-level + vendor chunks |
| Memory optimization | 100% | High — index-based TurnSnapshot, no duplication |
| Theme system | 100% | High — light/dark/high-contrast, all tokens, bonus a11y theme |
| Bottom panel infrastructure | 100% | High — 4 tabs, resize, collapse, auto-open, height + collapsed persisted to localStorage |
| Conversation response (UI-18) | 100% | High — 7/7 principles done, CostFooter redesigned, AgentCard with full stats |
| Topbar / HUD | 100% | High — 7 metrics live, turn indicator, WAIT state, red danger border on 80%+ context |
| Trace chart | 100% | High — proportional bars, 3-column layout, general icon derivation + hover, depth limit with toggle |
| Tool Call / Cost tabs | 100% | High — Detail header with badge/turn/tool/duration/cost; Cost tab with projected total + burn rate trend |

### What's next

```
Phase 4 (UI Revamp) ──── COMPLETE ✓
Phase 5 (Control) ────── Command center, agent controls, permissions
Phase 6 (Visibility) ─── Decision trace, time travel, spending view
Phase 7 (Observability)─ Health monitor, analytics, profiling
Phase 8 (Abstraction) ── Agent-first mode, task trees, workflows
```

---

## Non-Negotiables (All Phases)

| Budget | Target |
|--------|--------|
| SSE event latency | <50ms SDK → dashboard |
| Session load (cached) | <100ms for 1000 events |
| Live event processing | O(1) per event |
| Turn rendering | Only visible turns in DOM |
| Background sync | Skip when no new data |
| Memory | <200MB for 1000-event session |

**Rule:** Every feature must pass these budgets before merge. Performance regressions are P0.

---

## Key Principles

1. **Use the SDK.** Check `docs/spec/sdk-reference.md` first. If the SDK has a method, use it.
2. **Parity is the floor.** Every CLI feature works. Then: what can we show that the terminal cannot?
3. **Structure over text.** Where CLI shows text, show structured data. Stream → graph. Number → trend.
4. **Control, not just display.** Every metric should be actionable.
5. **Turn is the heartbeat.** Everything syncs to the selected turn.

---

## Deferred (Not in Plan)

| Feature | Reason |
|---------|--------|
| Collaborative viewing | Complex WebSocket rooms — future project |
| Fork session UI | SDK method exists but untested |
| Headless mode | Server-only, not relevant to web UI |
| Voice dictation | Requires browser Speech API — separate effort |
| Plugin marketplace | Depends on Anthropic plugin distribution |
