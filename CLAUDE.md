# claude-devtools

A comprehensive debugging and monitoring dashboard for Claude Code agents — real-time visualization of agent execution flow, token usage, costs, and tool invocations via MCP.

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

## Architecture Invariants

These are non-negotiable — violating any of these is a P0:

1. **Filesystem JSONL is the single source of truth** — All session data comes from Claude Code's `~/.claude/projects/` JSONL files. The server never persists or mutates session data; it is read-only from disk. Breaking this means data divergence between what Claude Code wrote and what the dashboard shows.
2. **Incremental parsing with byte offsets** — `parseJsonlIncremental()` tracks file byte offsets to avoid re-reading entire files. Always append-only reads. Re-reading full files on every change would make long sessions (10k+ events) unusable.
3. **Fail-safe parsing (skip malformed lines)** — Both full and incremental JSONL parsers catch JSON errors per-line and continue. A single corrupted line must never crash the session load or block subsequent events.
4. **Metrics computed server-side, not client-side** — Token aggregation, cost calculation, and DAG building happen in `computeMetrics()`. The dashboard receives pre-computed `SessionMetrics`. This ensures consistent numbers across clients and avoids floating-point drift.
5. **WebSocket broadcasts only new events** — The watcher never resends historical data. Dashboard must fetch the full session via REST first, then layer live events on top. This keeps bandwidth low for long-running sessions.

## Core Flow

```
Claude Code Agent (writes .jsonl events to ~/.claude/projects/)
  → File Watcher (chokidar monitors JSONL files for changes)
  → Parser (incremental JSONL reader, byte-offset tracking, line-by-line)
  → Analyzer (computeMetrics: token aggregation, cost calc, DAG building)
  → HTTP API (REST endpoints) + WebSocket (live event broadcast)
  → Dashboard (React SPA: useSessionMetrics + useEventStream hooks)
  → Components (AgentFlowDAG, TokenChart, EventStream, CommandDispatch)
```

## Key Gotchas

- **Model pricing is hardcoded** — `server/src/analyzer/metrics.ts` has a hand-coded `MODEL_PRICING` table. No API fetch. Must be manually updated when Anthropic changes rates.
- **DAG node costs always use sonnet pricing** — `aggregateTokens()` in `dag-builder.ts` hardcodes sonnet pricing for per-node cost. Top-level metrics use per-model pricing. This causes discrepancies in the agent breakdown view.
- **Content can be string or ContentItem[]** — Dashboard types allow both. `normalizeContent.ts` must coerce strings to arrays. Forgetting this causes runtime crashes in EventStream.
- **Live event buffer capped at 2000** — `useEventStream.ts` drops oldest events beyond 2000. Very long sessions lose mid-stream events on the live feed (full REST fetch is not capped).
- **MCP tools detected by name prefix only** — `countMcpToolCalls()` checks if tool name starts with `mcp__`. Custom tools with that prefix get miscounted; MCP tools without it get missed.
- **Permission state is in-memory only** — `permission-handler.ts` stores requests in a Map. Lost on server restart. No cross-instance persistence.

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
