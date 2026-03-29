# V3 Bug Tracker & OKR Metrics

**Last updated:** 2026-03-29 (post Tier 1)
**Status:** Active

---

## OKR: Production-Ready Claude Web Client

### KR1: Core Functionality — ~55% CLI parity
- Multi-turn sessions via SDK
- Permission handling (Promise-based + mode cycling + session allowances)
- Question handling (AskUserQuestion)
- Unified WebSocket with reconnect
- Session lifecycle (new/resume/abort/delete)
- Tool result display inline
- /clear, /compact, /model commands functional
- @ file path mentions with autocomplete
- Fork session: STUB (blocked on SDK)

### KR2: UI/UX Parity with Claude Desktop — 92%
- Conversation view with turn grouping
- Agent graph + snapshot tabs
- Markdown rendering + syntax highlighting
- Permission inline blocks with tool previews + agent ID badge + session allowance
- Turn completion via state machine (system/turn_duration)
- Per-model pricing in turn costs
- Context warning banner (90%/95%)
- Permission mode cycling (Shift+Tab + badge)
- Missing: Tier 2 observability features

### KR3: Stability & Reliability — 93%
- 509 tests passing (220 server + 289 dashboard), 0 failures
- TypeScript clean on both packages
- All P1 bugs resolved
- 7/7 architecture invariants passing
- Structured logging (pino)

### KR4: Architecture Invariants — 7/7 passing

---

## Active Bugs

### P2

| Issue | Category |
|-------|----------|
| Model pricing hardcoded (March 2026 rates) | Maintenance |
| Live event buffer 2000 cap | Scalability |
| Permission state in-memory only (lost on restart) | Persistence |
| Dual PermissionMode type definition (server/dashboard) | Code quality |
| Synchronous readdirSync on @ autocomplete | Performance |

### P3

| Issue | Category |
|-------|----------|
| CostBreakdown field names misleading | Naming |
| Dead code in getCommandOutput | Cleanup |

---

## Completed Work (2026-03-29)

### Tier 1 Features (PR #7) — 9/9 COMPLETE
| Task | Feature |
|------|---------|
| T1-01 | Tool result display (ToolResultBlock) |
| T1-02 | Code syntax highlighting (rehype-highlight) |
| T1-03 | /clear creates new session |
| T1-04 | /compact via message flow |
| T1-05 | /model switching (opus/sonnet/haiku) |
| T1-06 | Permission mode cycling (Shift+Tab + badge) |
| T1-07 | Allow for session end-to-end |
| T1-08 | Context warning banner (90%/95%) |
| T1-09 | @ file path mentions with autocomplete |

### Bug Fixes — 11 total
| Fix | Commit/PR |
|-----|-----------|
| DAG duplicate edges | PR #6 |
| DAG error detection dead code | PR #6 |
| Permission UI too minimal | PR #6 |
| Markdown not rendered | fb5e952 |
| Duplicate permission blocks | fb5e952 |
| Graph nodes disappear | fb5e952 |
| No completion indicator | fb5e952 |
| JSONL parser full-file read | a0afec8 |
| EDITOR injection | a0afec8 |
| useCosts staleness | a0afec8 |
| Turn cost sonnet-only | a0afec8 |

### Infrastructure
| Item | Commit |
|------|--------|
| Turn status state machine | 3fb2388 |
| SystemEvent type | 3fb2388 |
| Structured logging (pino) | 021c3bf |
| Per-model pricing (dashboard) | a0afec8 |
| JSONL byte-range reads | a0afec8 |
| Path traversal fix | PR #7 |

---

## Next: Tier 2 — "Better Than CLI" (~47h)

| Task | Feature | Priority |
|------|---------|----------|
| T2-01 | Diff viewer (per-turn file changes) | P2 |
| T2-02 | /cost detailed breakdown | P2 |
| T2-03 | /context visualization | P2 |
| T2-04 | /permissions rules viewer | P2 |
| T2-05 | /diff git changes | P2 |
| T2-06 | /copy clipboard | P2 |
| T2-07 | Command history (Up/Down) | P2 |
| T2-08 | /plan mode entry | P2 |
| T2-09 | /fast toggle | P2 |
| T2-10 | /effort control | P2 |
| T2-11 | Ctrl+C cancel binding | P2 |
| T2-12 | /rewind checkpoint | P2 |
| T2-13 | /mcp server status | P2 |
| T2-14 | /usage detailed | P2 |
| T2-15 | Image paste/upload | P2 |
| T2-16 | Task list panel | P2 |
| T2-17 | ! bash mode | P2 |
| T2-18 | Session analytics dashboard | P2 |
