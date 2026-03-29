# V3 Bug Tracker & OKR Metrics

**Last updated:** 2026-03-29 (4th merge)
**Status:** Active

---

## OKR: Production-Ready Claude Web Client

### KR1: Core Functionality — 95% complete
- Multi-turn sessions via SDK
- Permission handling (Promise-based)
- Question handling (AskUserQuestion)
- Unified WebSocket with reconnect
- Session lifecycle (new/resume/abort/delete)
- SystemEvent type for turn_duration signals
- Fork session: STUB (blocked on SDK)

### KR2: UI/UX Parity with Claude Desktop — 88% complete
- Conversation view with turn grouping
- Agent graph + snapshot tabs
- Permission inline blocks with tool previews + agent ID badge
- Markdown rendering in responses (react-markdown + remark-gfm)
- Turn completion via state machine (system/turn_duration, not heuristic)
- Per-model pricing in turn costs
- Missing: session lifecycle UI polish (Phase B)

### KR3: Stability & Reliability — 93% complete
- 424 tests passing (176 server + 248 dashboard)
- TypeScript clean on both packages
- All P1 bugs resolved
- Turn status uses definitive signal (no heuristics)
- 7/7 architecture invariants passing

### KR4: Architecture Invariants — 7/7 passing
- All invariants passing

---

## Active Bugs

### P2

| Issue | Category |
|-------|----------|
| Model pricing hardcoded (March 2026 rates) | Maintenance |
| Live event buffer 2000 cap | Scalability |
| Permission state in-memory only (lost on restart) | Persistence |

### P3

| Issue | Category |
|-------|----------|
| CostBreakdown field names misleading (tokensIn/Out stores dollars) | Naming |

---

## Resolved Bugs (2026-03-29)

### Merge 4: 3fb2388 (turn state machine)

| Bug | Fix |
|-----|-----|
| Turn completion heuristic (stop_reason + isLastTurn) | State machine via system/turn_duration — single signal, all turns |
| SystemEvent not in type system (silently dropped) | Added SystemEvent type to server + dashboard |
| isLastTurn position-based detection | Removed — turn.status drives UI directly |

### Merge 3: a0afec8 (audit P1/P2 fixes)

| Bug | Fix |
|-----|-----|
| JSONL parser reads entire file (P1) | Byte-range openSync/readSync |
| EDITOR env var injection (P1) | spawnSync replaces execSync |
| useCosts never refreshes (P2) | 5-minute polling interval |
| Turn cost sonnet-only pricing (P2) | Per-model pricing table |

### Merge 2: fb5e952 (OKR bug fixes)

| Bug | Fix |
|-----|-----|
| C-2: Markdown not rendered | react-markdown + remark-gfm |
| A-1: Duplicate permission blocks | ID-based dedup |
| B-1: Graph nodes disappear | filterDagForTurn fallback |
| C-1: No completion indicator | Generating.../timestamp footer |
| A-2: No agent context | Agent ID badge |

### Merge 1: PR #6 (DAG + permission fixes)

| Bug | Fix |
|-----|-----|
| DAG duplicate edges | Set-based deduplication |
| DAG error detection dead code | Check user events |
| Permission UI too minimal | ToolInputDetail component |

---

## Phase B — Remaining (~6h)

| Task | Status |
|------|--------|
| "New Session" button + modal | PARTIAL |
| "Resume Session" button | PARTIAL |
| Active session indicator | NOT BUILT |
| Session cleanup/close UI | NOT BUILT |

## Phase C — Remaining (~4h)

| Task | Status |
|------|--------|
| Add Repo button handler | NOT DONE |
| Empty state CTA | NOT DONE |
| Activity rings on graph nodes | NOT DONE |
