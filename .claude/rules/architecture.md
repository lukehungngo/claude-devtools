# Architecture Invariants

## Purpose

Define non-negotiable architecture rules. Violating any of these is a P0.

## Invariants

1. **Filesystem JSONL is the single source of truth** — All session data comes from Claude Code's `~/.claude/projects/` JSONL files. The server never persists or mutates session data; it is read-only from disk. Violating this causes data divergence between what Claude Code wrote and what the dashboard shows.
2. **Incremental parsing with byte offsets** — `parseJsonlIncremental()` tracks file byte offsets to avoid re-reading entire files. Always append-only reads. Re-reading full files on every change makes long sessions (10k+ events) unusable.
3. **Fail-safe parsing (skip malformed lines)** — Both full and incremental JSONL parsers catch JSON errors per-line and continue. A single corrupted line must never crash the session load or block subsequent events.
4. **Metrics computed server-side, not client-side** — Token aggregation, cost calculation, and DAG building happen in `computeMetrics()`. The dashboard receives pre-computed `SessionMetrics`. This ensures consistent numbers across clients and avoids floating-point drift.
5. **WebSocket broadcasts only new events** — The watcher never resends historical data. Dashboard must fetch the full session via REST first, then layer live events on top. Violating this causes bandwidth explosion for long-running sessions.

## How to Add New Invariants

1. Write the invariant as a clear, imperative statement
2. Explain WHY it matters (what breaks if violated)
3. Add it to this file AND to `CLAUDE.md`'s Architecture Invariants section
4. If an invariant was learned from a failure, add a P0 Lesson

## P0 Lessons

<!-- Add lessons here. Format:
### YYYY-MM-DD: {Title}
{What happened when invariant was violated. What this prevents.}
-->
