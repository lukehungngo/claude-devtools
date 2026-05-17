# claude-devtools

Observability, tracing, and intelligence for the Claude Code CLI. Monorepo: `server/` (Express + SDK), `dashboard/` (React + Vite), `mcp/` (standalone MCP server).

## Build & Test

```bash
cd server && pnpm test && cd ../dashboard && pnpm test  # run tests
cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit  # type check
```

## Code Style

- TypeScript strict, Vitest, ESLint 9
- Dashboard: Tailwind `dt-*` tokens, `lucide-react`, named exports, no inline styles
- Server: pino logger (never `console.log`), `spawnSync` not `execSync`

## Architecture

### Server (`server/src/`)

**`parser/jsonl-reader.ts`**
- `parseJsonlFile()`: full file parse, returns `SessionEvent[]`
- `parseJsonlIncremental()`: byte-offset reads from last position, returns new events + new offset
- Fail-safe: catches JSON errors per-line, skips malformed, never crashes

**`parser/session-discovery.ts`**
- `discoverSessions()`: scans `~/.claude/projects/`, returns `SessionInfo[]` (cached with stat-based invalidation)
- `loadFullSession()`: returns `{ mainEvents, subagentEvents, subagentMeta }` for a session
- `SessionCache`: mtime+size invalidation, head/tail byte-range reads for metadata

**`analyzer/metrics.ts`**
- `computeMetrics()`: takes `(sessionInfo, mainEvents, subagentEvents, subagentMeta)`, returns `SessionMetrics`
- `calculateTokenCost()`: per-model cost from token counts using `modelPricing.ts` rates

**`analyzer/dag-builder.ts`**
- `buildAgentDAG()`: constructs agent dependency graph from events
- Single-pass `analyzeEvents()` with O(1) edge lookup via `descriptionToAgentId` Map

**`analyzer/efficiency/`** — intelligence layer (7 pattern detectors)
- `wasted-retries.ts`: same (tool, args) ≥3× consecutive → flags with exact $ wasted
- `blind-edits.ts`: Edit/Write without prior Read of same file within 10 events
- `session-fragmentation.ts`: ≥3 short sessions (<15 events) on same project/day
- `cost-waste.ts`: sessions > $3 with no end_turn OR > 25% tool error rate
- `model-overuse.ts`: Opus on simple sessions (≤40 events, 0 subagents)
- `cache-misses.ts`: cache_read / (cache_read + cache_creation + input) < 0.2 per session
- `improving-trend.ts`: error rate or cache hit rate improved ≥20% vs prior period
- `index.ts`: orchestrator — runs all detectors, ranks by impact, caches results per range
- `hint-ranker.ts`: sorts detected patterns by impact, templates punchline strings

**`session/session-manager.ts`**
- Manages active Claude Code sessions started from the dashboard
- `startSession(cwd)`: creates session, returns UUID
- `sendMessage(sessionId, prompt)`: calls Agent SDK `query()`, yields async message stream
- New sessions use `{ sessionId }`, resumed sessions use `{ resume: sessionId }`
- `canUseTool` callback bridges to dashboard permission UI (Promise-based, 10min timeout)

**`http/routes/`** — Express sub-routers
- `session-routes.ts`: REST + SSE for session CRUD, message streaming, permission handling
- `insights-routes.ts`: aggregated analytics (tokens, costs, trends, model mix)
- `efficiency-routes.ts`: punchline hints, drill-down evidence, AI-synthesized reports
  - `GET /efficiency/hints?range=7d` — server-computed pattern detection, no AI
  - `GET /efficiency/hints/:id/evidence` — pre-computed evidence for one hint
  - `POST /efficiency/report` — AI-synthesized report via SessionManager (primary) or API key (fallback)
  - `GET /efficiency/reports` — list saved reports from `~/.claude/devtools/reports/`
  - `GET /efficiency/reports/:id` — return saved report markdown

**`http/sse-event-handler.ts`**
- Maps Agent SDK message types to SSE event types (stdout, thinking, tool_start, tool_end, etc.)

### Dashboard (`dashboard/src/`)

**`routes/InsightsPage.tsx`**
- Insights page: headline tiles, efficiency hints, token trends, model mix, heatmaps
- Time range selector (24h/7d/30d/90d/all) controls all sections
- "all" maps to "90d" for efficiency hints

**`components/insights/`** — Efficiency Hints feature
- `EfficiencyHints.tsx`: fetches hints, renders punchline cards, "Tell me more" button
- `HintCard.tsx`: single hint with Lucide icon + expandable evidence
- `HintEvidence.tsx`: shows recommendation + affected sessions with links
- `EfficiencyReport.tsx`: streams AI-synthesized report via SSE, renders markdown live

**`components/session/`** — Session viewer
- Virtualized turn list, agent DAG, tool call detail, permission handling

### MCP (`mcp/src/`) — standalone MCP server (deferred from main product)

- 15 metric tools, 5 assessment prompts, 3 resources
- Reuses server's parser/analyzer as a library
- Stdio JSON-RPC transport, no HTTP daemon
- Available but not the primary path for the dashboard

## Key Design Decisions

### Why SessionManager for AI reports, not direct API
The dashboard server already has Claude Agent SDK integration for active sessions. Routing reports through SessionManager means: same auth (subscription or API key), same billing, zero config. Users don't need to set ANTHROPIC_API_KEY. Falls back to direct SDK for standalone deployments.

### Why rule-based hints + AI synthesis (not all-AI)
Rules are fast (no API call), deterministic, and always available. They fire on exact conditions with exact dollar impacts. AI adds value the rules can't: connecting patterns across dimensions, explaining root causes, citing the latest Claude Code best practices. Rules detect WHAT is wrong. AI explains WHY and prescribes HOW to fix.

### Why 4 dimensions (Cost, Efficiency, Quality, Latency)
These map to what developers actually optimize: spend less, work faster, get it right the first time, reduce wait. The system prompt instructs the AI to evaluate across all four. Detectors tag which dimensions they cover so the AI can cross-reference.

### Why JSONL is read-only
Claude Code owns the JSONL files. The dashboard never writes to `~/.claude/projects/`. Reports are saved to a separate `~/.claude/devtools/reports/` directory. This prevents any chance of corrupting Claude Code's session data.

### Why byte-offset incremental parsing
JSONL files can be 10MB+. Re-reading the full file on every change caused 500MB disk I/O per request (P0 lesson from 2026-03-30). `openSync`/`readSync` with byte offsets reads only new data. Returns `newOffset = stat.size` (bytes, not characters).

## Architecture Invariants

1. **JSONL is source of truth** — read-only from `~/.claude/projects/`. Never mutate.
2. **Byte-offset incremental parsing** — `openSync`/`readSync`, never re-read full file.
3. **Fail-safe parsing** — skip malformed lines, never crash.
4. **Metrics server-side** — `computeMetrics()` on server, dashboard gets pre-computed.
5. **WS broadcasts only new events** — REST for full session, WS for deltas.
6. **SDK events via SSE** — active sessions stream from `query()` iterator directly.
7. **Promise-based permissions** — `canUseTool` returns Promise, 10min timeout.
8. **Low latency, high performance** — if it's slower than the terminal, no one uses it. O(1) per event, cached reads, memoized renders. Performance regressions are P0.
9. **Data integrity** — numbers must be correct. Token counts, costs, status must match JSONL source. Wrong data is worse than no data.
10. **Smooth UI/UX** — 60fps scrolling, instant feedback, no jank. Virtualized lists, batched updates, stable refs. Visual quality is not optional.

## Business Logic Invariants

1. **NO GUESS WORK** - use anthropic sdk, claude code github and ground truth from JSONL
2. **Educated GUESS** must be approved and reasonable

## Common Gotchas

1. **Agent status flash**: `determineAgentStatus()` must require BOTH `hasEndTurn && !isRecent` to declare "completed". The 2026-04-12 flash bug: agent quiet >30s → "completed" → new event → "active" → flash. Subagents are different: they mark "completed" when EITHER condition is true.
2. **Tool errors live in user events**: `tool_result.is_error` is in `UserEvent`, not `AssistantEvent`. The DAG error detection originally checked the wrong event type.
3. **No `execSync` with user input**: The 2026-03-29 shell injection via `EDITOR` env var. Always `spawnSync(cmd, [args])`.
4. **useEffect with state in deps**: Putting `liveEvents` in a background sync useEffect dependency array resets the interval on every RAF batch (~16ms). Use a ref instead.
5. **SessionInfo.startTime is a string**: ISO format, not a number. Parse with `new Date(s.startTime).getTime()` for comparisons.
6. **Efficiency hints cache dependency**: `getEvidence()` reads from an in-memory cache populated by `computeHints()`. If hints haven't been fetched for a given range, evidence returns 404.
7. **Model ID format**: Use `"claude-sonnet-4-6"` not dated suffixes. The SDK resolves aliases.

## Data Flow

```
~/.claude/projects/*.jsonl (Claude Code writes)
    ↓
parser/session-discovery.ts (discovers, caches, reads incrementally)
    ↓
analyzer/* (computeMetrics, buildToolStats, buildAgentDAG, efficiency detectors)
    ↓
http/routes/* (REST endpoints)
    ↓                          ↓
Dashboard (React)          WebSocket (live events)
    ↓
Insights page → Efficiency Hints
    ↓ (user clicks "Tell me more")
SessionManager → Agent SDK → query() → SSE stream → markdown report
    ↓
~/.claude/devtools/reports/*.md (saved locally)
```

## Port Configuration

- Server: **3142** (configurable via `DEVTOOLS_PORT` env)
- Dashboard: Vite default (usually 5173, auto-increments if taken)
- Update `dashboard/vite.config.ts` proxy and `.mcp.json` if changing server port

## Key References

- **Domain knowledge & SDK reference:** `docs/spec/` (read before new features)
- **Efficiency Hints spec:** `docs/specs/2026-05-17-efficiency-hints.md`
- **Gap matrix:** `docs/spec/gap-matrix.md`
- **Lessons learned:** `docs/lessons_learned/`
- **OKR & progress:** `docs/plans/v3-okr-tiers.md`
- **Claude Code source of truth:** https://github.com/anthropics/claude-code — canonical reference for JSONL event schemas, CLI behavior, and session format
- **Anthropic SDK source of truth:** https://github.com/anthropics/anthropic-sdk-typescript — canonical reference for SDK types, streaming API, and tool use contracts

## Project Type

- **has_ui:** true
