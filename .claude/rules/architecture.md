# Architecture Invariants

## Purpose

Define non-negotiable architecture rules. Violating any of these is a P0.

## Invariants

1. **Filesystem JSONL is the single source of truth** — All session data comes from Claude Code's `~/.claude/projects/` JSONL files. The server never persists or mutates session data; it is read-only from disk. Violating this causes data divergence between what Claude Code wrote and what the dashboard shows.
2. **Incremental parsing with byte offsets** — `parseJsonlIncremental()` uses `fs.openSync` + `fs.readSync` with byte offsets to read only new data from JSONL files. Returns `newOffset = stat.size` (bytes, not characters). Never re-reads the full file. Uses `try/finally` to ensure the file descriptor is always closed.
3. **Fail-safe parsing (skip malformed lines)** — Both full and incremental JSONL parsers catch JSON errors per-line and continue. A single corrupted line must never crash the session load or block subsequent events.
4. **Metrics computed server-side, not client-side** — Token aggregation, cost calculation, and DAG building happen in `computeMetrics()`. The dashboard receives pre-computed `SessionMetrics`. This ensures consistent numbers across clients and avoids floating-point drift.
5. **WebSocket broadcasts only new events** — The watcher never resends historical data. Dashboard must fetch the full session via REST first, then layer live events on top. Violating this causes bandwidth explosion for long-running sessions.
6. **Active sessions stream SDK events directly** — For sessions started from the web UI, events flow from the SDK `query()` iterator directly to the client via SSE. JSONL is the persistence layer; SSE is the real-time transport.
7. **Permission resolution is Promise-based** — The `canUseTool` callback returns a Promise that resolves when the dashboard user clicks approve/deny. No polling. Promises time out after 10 minutes to prevent indefinite hangs.

8. **Low latency, high performance is non-negotiable** — This tool replaces the CLI. If it's slower than the terminal, no one will use it. Every feature must meet these budgets:

| Budget | Target | What Breaks If Violated |
|--------|--------|------------------------|
| SSE event latency | <50ms from SDK to dashboard | User sees lag between tool calls |
| Session load (cached) | <100ms for 1000-event session | Clicking a session feels sluggish |
| Live event processing | O(1) per event, not O(n) | Lag grows with session length |
| Turn rendering | Only visible turns in DOM | Browser freezes on 100+ turns |
| DAG layout | Only recompute on structure change | Janky graph on every event |
| Background sync | Skip when no new data | Wasted I/O every 30s |
| Memory | <200MB for 1000-event session | Browser tab crashes |

Rules for every new feature:
- **No O(n) on every event** — use incremental updates, caches, refs
- **No full file re-reads** — use byte-offset reads, stat-based caching
- **No unnecessary re-renders** — React.memo with proper comparators, stable refs
- **No sync I/O on request paths** — use async fs/promises in route handlers
- **Cache everything that doesn't change** — metrics, sessions, positions, search indices

## How to Add New Invariants

1. Write the invariant as a clear, imperative statement
2. Explain WHY it matters (what breaks if violated)
3. Add it to this file AND to `CLAUDE.md`'s Architecture Invariants section
4. If an invariant was learned from a failure, add a P0 Lesson

## P0 Lessons

### 2026-03-29: JSONL parser was reading entire file
`parseJsonlIncremental()` used `readFileSync` + `content.slice(fromOffset)` which re-read the entire file on every change. Fixed by switching to `openSync` + `readSync` with byte offset. Invariant #2 now enforces byte-range reads.

### 2026-03-29: DAG error detection checked wrong event type
`determineAgentStatus()` checked `assistant` events for `tool_result.is_error`, but tool_result content items are in `user` events per Claude Code's JSONL format. Error status was never detected. Fixed by checking `user` events.

### 2026-03-29: open-file route used execSync with EDITOR env var
`execSync(\`${editor} "${filePath}"\`)` allowed shell injection if EDITOR contained metacharacters. Fixed by using `spawnSync(editor, [filePath])` which bypasses shell interpretation entirely.

### 2026-03-30: discoverSessions() read every JSONL file on every API call
11 route handlers called `discoverSessions()` which did `readFileSync` on every `.jsonl` file. 50 sessions × 10MB = 500MB disk I/O per request. Fixed with `SessionCache` using stat-based invalidation (mtime+size) and head/tail byte-range reads for metadata.

### 2026-03-30: Every WS event triggered full REST refetch
`SessionPage.tsx` debounced 500ms then called `refreshMetrics()` on every live event — re-reading the entire session from disk at ~2Hz during active streaming. Fixed with 30s background sync + skip-when-no-new-events guard.

### 2026-03-30: allEvents cascade — O(n) on every WS event
Each WS event → new array ref → Set rebuild of all UUIDs → full groupEventsIntoTurns → full DAG recompute → all components re-render. Fixed with: RAF batching, cached restKeys Set, incremental turn grouping, stable DAG refs, React.memo on AgentNodeCard/ResponseBlock/TurnCard.

### 2026-03-30: DAG buildAgentDAG iterated events 5 times
Separate calls to `aggregateTokens()`, `countToolCalls()`, `countMcpToolCalls()`, `determineAgentStatus()`, plus edge detection loop. Fixed with single-pass `analyzeEvents()` + O(1) edge lookup via `descriptionToAgentId` Map.

### 2026-03-30: useEffect with state in deps tears down intervals
`liveEvents` in the background sync `useEffect` dependency array caused the 30s interval to reset on every RAF batch (every ~16ms during streaming). Interval never reached 30s. Fixed by reading `liveEvents.length` from a ref instead.

### 2026-04-12: Agent status flashed completed while still computing
`analyzeEvents()` returned `"completed"` for the case `hasEndTurn=false, isRecent=false` — i.e. an agent quiet for >30s that never sent `end_turn` (long computation, slow tool). When new events eventually arrived, status flipped back to `"active"`, producing the cycle: active → (quiet >30s) → completed → (new event) → active → flash. Fixed by requiring BOTH conditions to declare completion: `hasEndTurn && !isRecent ? "completed" : "active"`. An agent is "completed" ONLY when it explicitly sent end_turn AND its events are stale. Any other state is "active".

### 2026-04-15: Subagent stuck "running" after finishing without end_turn
The flash fix was too strict for subagents. Subagents that finished after a tool_use (never sending `end_turn`) were permanently stuck as "active". Unlike the main agent, subagents don't get new turns and their events don't resume. Fixed by adding `isSubagent` flag: subagents mark "completed" when EITHER `hasEndTurn` OR `!isRecent` (stale events). The flash bug can't occur for subagents because their events don't resume after going quiet.
