# Claude DevTools — Repositioning Design
**Date:** 2026-04-22  
**Status:** Approved

## Vision

Reposition Claude DevTools from a "debugging and monitoring dashboard" to the **observability layer for the Claude Code CLI** — emphasizing live observability, turn-by-turn traceability, and cross-session insights.

## Audience

Both solo developers using Claude Code daily and teams building production systems with Claude. Both need to understand what their AI is doing, what it did, and what patterns emerge over time.

## Pillar Hierarchy

1. **Live observability** (lead) — real-time agent graph, streaming events, active cost
2. **Insights** (second) — token trends, top consumers, efficiency signals across sessions
3. **Audit trail / traceability** (supporting) — turn-by-turn forensics, session history; no replay

## Tone

Precise and professional now. Evolves toward developer-confident as the product matures.

## Core Copy

| Layer | Copy |
|-------|------|
| One-liner | `Live observability, turn-by-turn traces, and usage insights for Claude Code` |
| One sentence | Claude DevTools is the observability layer for Claude Code — monitor active sessions in real-time, trace what happened turn-by-turn, and extract insights from your usage over time. |
| UI tagline | `Observe · Trace · Understand` |

## Touchpoints

### `package.json` (root)
- **description**: `"Live observability, turn-by-turn traces, and usage insights for Claude Code"`
- **keywords**: `["claude", "claude-code", "anthropic", "observability", "tracing", "insights", "monitoring", "developer-tools"]`

### `CLAUDE.md` (line 3)
- **Before**: `Web-based Claude Code client with agent observability.`
- **After**: `Observability, tracing, and insights for the Claude Code CLI.`

### `README.md` (headline description)
- **Before**: `A comprehensive debugging and monitoring dashboard for Claude Code agents. Monitor agent execution flow, token usage, costs, tool invocations, and more in real-time.`
- **After**: `Claude DevTools is the observability layer for Claude Code — monitor active sessions in real-time, trace what happened turn-by-turn, and extract insights from your usage over time.`

### `server/src/index.ts` (MCP tool description)
- **Before**: `Open the Claude DevTools dashboard in the browser. Shows agent flow visualization, token/cost metrics, tool usage stats, and session timeline.`
- **After**: `Open Claude DevTools — real-time observability for Claude Code. Live agent traces, turn-by-turn session forensics, and usage insights.`

### `dashboard/src/routes/HomePage.tsx` (empty state subtitle)
- **Before**: `Select a session from the sidebar to begin`
- **After**: `Observe · Trace · Understand` (with instruction text below)

### All `.claude/agents/*/CLAUDE.md` (7 files)
- **Before**: `A comprehensive debugging and monitoring dashboard for Claude Code agents.`
- **After**: `Observability, tracing, and insights for the Claude Code CLI.`

### `.claude/settings.local.json` (PROJ_DESC)
- **Before**: `real-time debugging and monitoring dashboard for Claude Code agents`
- **After**: `observability, tracing, and insights layer for the Claude Code CLI`

## Files NOT Changed

- `dashboard/index.html` `<title>` — short titles better for browser tabs
- `server/src/cli.ts` startup messages — status lines, not marketing
- `SetupGate.tsx` subtitle — functional label, not positioning
- Internal package names (`claude-devtools-server`, `claude-devtools-dashboard`) — private, no impact

## Out of Scope

- Product name change (stays "Claude DevTools")
- Navigation restructuring
- Feature additions
