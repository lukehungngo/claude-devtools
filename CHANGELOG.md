# Changelog

All notable changes to `@lukehungngo/claude-devtools` are documented here.
Releases prior to 0.4.0 are recorded only as git tags (`v0.3.x`).

## 0.4.0

### Highlights

A new **Agent Graph** tab gives you an interactive, live map of every agent a
session ran — plus fixes that make agent running-status accurate during
multi-turn and error-recovery work.

### Features

- **Agent Graph tab.** A new top-level `/graph` view renders a session's full
  agent DAG on an interactive react-flow canvas — draggable nodes, minimap,
  zoom/pan controls, and a GSAP-animated entrance. Nodes are color-coded for
  running vs. finished agents.
- **Two-step repo → session picker.** Pick a repo, then a session within it,
  through a hardened, accessible combobox (type-to-filter, keyboard navigation,
  ARIA, active-first defaulting, and stale-selection recovery so the graph never
  points at a dead session).
- **Graph Summary overlay.** An on-canvas summary shows total / running /
  finished agent counts and a per-type breakdown.
- **Log + Workflows right rail.** The Graph tab's right panel has a **Log** tab
  (the selected agent's live, full, markdown-rendered output) and a
  **Workflows** tab — a scrollable workflow-table listing each orchestrated
  multi-agent run with per-agent status, model, token counts, tool calls, and
  result summary (grouped by phase), plus per-workflow **total tokens and
  wall-clock duration** in each card header.
- **Workflow analysis.** The server now discovers orchestrated workflows from
  each session's `subagents/workflows/<id>/journal.jsonl` (fail-safe parsing)
  and surfaces them in session metrics.
- **Live graph updates.** The selected session's graph and workflows refresh on
  new events via a debounced WebSocket-driven refresh, reusing the authoritative
  server status.
- **Inline `!bash` results.** Commands run from the conversation composer now
  render their output inline.
- **Throttle indicator.** The prompt input surfaces transient rate-limit /
  API-retry signals while a turn keeps streaming.
- **AskUserQuestion support.** An agent's clarifying questions in an active
  session are bridged to the dashboard's interactive prompt, and your answer is
  fed back to the model.

### Fixes

- **Agent running-status (multi-turn).** A `turn_duration` now only closes the
  current/last turn instead of any turn anywhere in the stream, so running
  multi-turn sessions no longer falsely show the main agent as completed. Fixed
  on both server and dashboard.
- **Agent running-status (errors).** An agent that hit a tool error while still
  executing now correctly shows as running. Status precedence is now
  active > error > completed — liveness wins over an earlier tool error.
- **Streaming errors no longer hang.** Server error frames (rate limit, billing,
  SDK throw) now surface in the composer instead of leaving a silent
  "Working..." pulse.
- **Ctrl+C clears the live preview** so the spinner doesn't linger after you
  cancel mid-stream.
- **No double-rendered turns.** Once a turn finalizes, the live preview is
  dropped and the spinner stops, leaving only the committed turn.
- **First-turn permission mode.** The permission mode chosen in the top bar
  (plan / acceptEdits / etc.) is now applied to a freshly started session before
  its first message.
- **Concurrency hardening.** Concurrent double-submits to a busy session are
  rejected with HTTP 409 before streaming starts; a normally-finished turn no
  longer aborts the next message's stream; and a parked permission / question
  prompt is treated as a busy state.
- Selecting no agent (or a synthetic agent) in the Graph log panel no longer
  triggers a wasted server round-trip.
- Re-enabled the "Fix the error above" prompt suggestion after a turn that ended
  in a tool error.

### Chores

- Upgraded `@anthropic-ai/claude-agent-sdk` to **0.3.156** and
  `@anthropic-ai/sdk` to **0.100.1**; removed permission-mode casts now that
  `auto`/`dontAsk` are native to the SDK type.
- Added the **MessageDisplay** hook event (new in SDK 0.3.152) to the hook editor.
- Added `gsap` / `@gsap/react` dashboard dependencies for graph and panel
  animations.
- Added public `WorkflowSummary` / `WorkflowAgentSummary` types and a
  `workflows` field on `SessionMetrics`; `AgentLogEntry` gained a full
  untruncated `content` field.
- Added a root `build` + `prepublishOnly` script so the published `dist/` is
  always rebuilt from current source (never ships stale).
- Replaced a startup `console.log` in the debug-DB backfill with the pino logger.
- Extensive new tests for the Graph tab, workflow analyzer, picker, streaming
  state, status fixes, and session concurrency.
