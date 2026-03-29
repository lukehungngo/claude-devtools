# claude-devtools

A web-based Claude Code client with built-in agent observability — multi-turn conversations, tool permissions, agent graph visualization, token/cost tracking, and real-time session monitoring.

## Build & Test

```bash
make install                     # dev install (server + dashboard)
pnpm install                     # root devDeps (eslint)
cd server && pnpm test && cd ../dashboard && pnpm test  # run tests (vitest)
pnpm lint                        # lint (eslint)
pnpm lint:fix                    # lint + autofix
cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit  # type check
make build                       # build
```

## Code Style

- TypeScript 5.x (monorepo: server + dashboard)
- React 18, Vite 5, TailwindCSS 3, Express 4, MCP SDK, Recharts, XYFlow
- Vitest for testing (both server and dashboard)
- ESLint 9 (flat config) with typescript-eslint + react-hooks plugin

## Project Type

- **has_ui:** true  <!-- Set to true if this project has a user interface (web, mobile, desktop). When true, the UI/UX Designer agent is activated in the pipeline. When false, all UI routing is skipped. -->

## Tech Stack

### Server
- **Runtime:** Node.js + TypeScript 5.x
- **Framework:** Express 4
- **SDK:** `@anthropic-ai/claude-agent-sdk` (multi-turn sessions, streaming, permissions)
- **MCP:** `@modelcontextprotocol/sdk` (tool protocol)
- **File watching:** chokidar 3 (JSONL file monitoring)
- **WebSocket:** ws 8 (live event broadcast, heartbeat ping every 30s)
- **Database:** better-sqlite3 (debug DB, optional)
- **Testing:** Vitest

### Dashboard
- **Framework:** React 18 + TypeScript 5.x
- **Bundler:** Vite 5
- **Routing:** @tanstack/react-router
- **Styling:** TailwindCSS 3 with semantic `dt-*` design tokens
- **Markdown:** react-markdown + remark-gfm (response rendering)
- **DAG visualization:** @xyflow/react + custom tree layout (no dagre)
- **Charts:** Recharts
- **Virtual scrolling:** @tanstack/react-virtual (agent logs)
- **Icons:** lucide-react
- **Testing:** Vitest + @testing-library/react

## Architecture Invariants

These are non-negotiable — violating any of these is a P0:

1. **Filesystem JSONL is the single source of truth** — All session data comes from Claude Code's `~/.claude/projects/` JSONL files. The server never persists or mutates session data; it is read-only from disk. Breaking this means data divergence between what Claude Code wrote and what the dashboard shows.
2. **Incremental parsing with byte offsets** — `parseJsonlIncremental()` uses `fs.openSync` + `fs.readSync` with byte offsets to read only new data. Never re-reads the full file. Returns `newOffset = stat.size` (bytes, not characters).
3. **Fail-safe parsing (skip malformed lines)** — Both full and incremental JSONL parsers catch JSON errors per-line and continue. A single corrupted line must never crash the session load or block subsequent events.
4. **Metrics computed server-side, not client-side** — Token aggregation, cost calculation, and DAG building happen in `computeMetrics()`. The dashboard receives pre-computed `SessionMetrics`. This ensures consistent numbers across clients and avoids floating-point drift.
5. **WebSocket broadcasts only new events** — The watcher never resends historical data. Dashboard must fetch the full session via REST first, then layer live events on top. This keeps bandwidth low for long-running sessions.
6. **Active sessions stream SDK events directly** — For sessions started from the web UI, events flow from the SDK `query()` iterator directly to the client via SSE. JSONL is the persistence layer; SSE is the real-time transport.
7. **Permission resolution is Promise-based** — The `canUseTool` callback returns a Promise that resolves when the dashboard user clicks approve/deny. No polling. Promises time out after 10 minutes.

## Logging

Structured logging via **pino** with subsystem child loggers. Logs to both stdout and file (`~/.claude-devtools/logs/server.log`).

| Subsystem | Logger | What it logs |
|-----------|--------|-------------|
| `session` | `sessionLog` | Session create/resume/abort/remove, sendMessage start/complete/error, GC cleanup |
| `permission` | `permissionLog` | Permission requested/resolved (tool name, decision) |
| `parser` | `parserLog` | Malformed JSONL lines (file path, error) |
| `websocket` | `wsLog` | Client connect/disconnect (client count) |
| `http` | `httpLog` | Server startup, critical route errors |

**Rules:**
- Log all session lifecycle events at `info` level
- Log permission decisions at `info` level (audit trail)
- Log malformed JSONL and timeouts at `warn` level
- Log errors at `error` level with error string
- Use child loggers (`logger.child({ subsystem })`) — never raw `console.log`
- Include relevant IDs in every log (sessionId, requestId, toolName)
- Log file location: `~/.claude-devtools/logs/server.log`

## Core Flow

### Active Session (web UI)
```
Dashboard PromptInput → POST /api/sessions/:id/message
  → SessionManager.sendMessage() → SDK query() async iterator
  → SSE stream to client (real-time, <50ms)
  → Claude Code writes .jsonl → File Watcher → WS broadcast (parallel)
```

### Historical / CLI Session
```
Claude Code Agent (writes .jsonl events to ~/.claude/projects/)
  → File Watcher (chokidar, 200ms stabilization)
  → Parser (incremental byte-range reader, line-by-line)
  → Analyzer (computeMetrics: token aggregation, cost calc, DAG building)
  → HTTP API (REST endpoints) + WebSocket (live event broadcast)
  → Dashboard (React SPA: unified WS + REST hydration)
```

### Permission Flow
```
SDK canUseTool callback → SessionManager.handlePermission()
  → Promise created + WS broadcast to dashboard
  → PermissionBlock renders inline (tool-specific input preview)
  → User clicks Allow/Deny → POST /api/permissions/:id/decide
  → Promise resolves → SDK continues/stops
```

## Key Gotchas

- **Model pricing is hardcoded** — Both `server/src/analyzer/metrics.ts` and `dashboard/src/lib/cost.ts` have hand-coded `MODEL_PRICING` tables. Must be manually updated when Anthropic changes rates. Server includes cache pricing (cacheWrite, cacheRead); dashboard only has input/output pricing.
- **DAG node costs use per-model pricing** — `aggregateTokens()` in `dag-builder.ts` reads the model from each event and uses `calculateTokenCost()` with the actual model. Falls back to sonnet pricing if the model field is missing.
- **Dashboard per-turn costs use per-model pricing** — `turnSnapshot.ts` and `AgentLogs.tsx` use `calculateTurnCost()` from `lib/cost.ts`. This covers input/output tokens but does NOT include cache token costs (unlike the server). For cache-heavy sessions, per-turn costs will be slightly lower than server totals.
- **Content can be string or ContentItem[]** — Dashboard types allow both. `normalizeContent.ts` must coerce strings to arrays. Forgetting this causes runtime crashes.
- **Live event buffer capped at 2000** — `useEventStream.ts` drops oldest events beyond 2000. Very long sessions lose mid-stream events on the live feed (full REST fetch is not capped).
- **MCP tools detected by name prefix only** — `countMcpToolCalls()` checks if tool name starts with `mcp__`. Custom tools with that prefix get miscounted; MCP tools without it get missed.
- **Permission state is in-memory only** — `permission-handler.ts` stores requests in a Map. Lost on server restart. Client-side capped at 50 resolved permissions.
- **DAG edges deduplicated by target** — `buildAgentDAG()` uses a `Set<string>` to prevent duplicate edges when the same agent type is invoked multiple times.
- **DAG error detection checks user events** — `determineAgentStatus()` looks for `tool_result.is_error` in `user` events (not `assistant` events), matching Claude Code's JSONL format.
- **Graph falls back to full DAG on empty turns** — `filterDagForTurn()` returns the unfiltered DAG when `activeTurn.agents` is empty (brand-new turns before agents respond), preventing node disappearance.
- **open-file route uses spawnSync** — Never execSync. Editor name and file path are passed as separate arguments to avoid shell injection.

## Mandatory Workflow

Before any implementation, you MUST follow this workflow. No code changes until the plan is reviewed and approved.

### The Pipeline

1. **Brainstorm first** (`/ask-questions`) — Refine rough ideas through questions, explore alternatives, present design for validation.
2. **Create isolated workspace** (git worktree) — Create isolated workspace on a new branch, run project setup, verify clean test baseline.
3. **Write the plan** (`/writing-plans`) — Break work into bite-sized tasks (2-5 min each). Every task has exact file paths, complete code, verification steps.
4. **Design first (if `has_ui: true`)** — For UI tasks, the UI/UX Designer produces component specs, state mapping, interaction flows, and accessibility checklist before any code is written.
5. **Execute the plan** (`/subagent-driven-development`) — Dispatch fresh subagent per task with two-stage review (spec compliance, then code quality).
6. **TDD during implementation** (`/test-driven-development`) — Enforce RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit.
7. **Review between tasks** (`/requesting-code-review`) — Review against plan, report issues by severity. Critical issues block progress.
8. **Finish the branch** (`/finishing-branch`) — Verify tests pass, present options (merge/PR/keep/discard), clean up worktree.
