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
