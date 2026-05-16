# Claude Code Parity Gap Report

**Anchor:** `anthropics/claude-code` CHANGELOG v2.1.143 (2026-05-15)
**Created:** 2026-05-16
**Branch at audit:** `master` @ `797ac94`

## Source-of-truth notes

- CC is closed source; CHANGELOG is the authoritative behavior reference.
- OpenClaude (`Gitlawb/openclaude`) is a fork — used as a **window into CC internals** for things like JSONL shape, but never as a feature target. Any "OC-only" addition is out of scope.
- Some details (exact JSONL event shapes for newer event types) require capturing a live CC session and grepping the JSONL.

## Method

For each suspected gap:
1. Confirm with evidence in `anthropics/claude-code` CHANGELOG.
2. Confirm absence/incompleteness with file path + line in `server/` or `dashboard/`.
3. Classify P0 (silent data corruption) / P1 (feature dark) / P2 (polish).

## Out of scope (explicitly retracted)

| Item | Reason |
|---|---|
| Multi-provider routing (OpenAI/Gemini/Ollama/etc.) | OC-only; CC is Anthropic-only |
| gRPC `AgentService.Chat` | OC addition |
| SQLite "working store" + JSON audit log + Orama | OC PR #1106; not in CC |
| Coordinator/worker mode | OC abstraction |
| autoDream / autoFix / ultraplan | OC services |
| microCompact / snipCompact / contextCollapse / sessionMemoryCompact | OC compact family — CC has only `/compact`, autocompact, Rewind→Summarize |
| SessionMemory / extractMemories / wiki / knowledge graph | OC additions |
| Voice STT as JSONL event class | CC voice is VSCode push-to-talk dictation only — not a session event |
| Buddy companion, sponsored tips, sinkKillswitch | OC additions |
| `~/.openclaude/projects/` discovery | OC-only |
| `agent-<id>.meta.json` sidecar | Not confirmed in CC source |

## Confirmed gaps

### P0 — Silent data corruption

#### P0-1 — `stop_reason` enum too narrow

**Devtools:** `server/src/types.ts:53` defines
```ts
stop_reason: "end_turn" | "tool_use" | null
```

**Consumers (incorrectly treat unknown values as `null`):**
- `server/src/analyzer/agentStatus.ts:62`
- `server/src/debug/lifecycle-builder.ts:88`
- `server/src/cache/session-cache.ts:356`

**CC truth:** Anthropic Messages API + CC sessions can emit:
- `end_turn`
- `tool_use`
- `max_tokens`
- `stop_sequence`
- `pause_turn`
- `refusal`
- `null` (in-progress / streaming)

**Impact:** Sessions stopped by `max_tokens` (context-cap hit) or `refusal` (Usage Policy) are misclassified as "still running" → wrong agent status, wrong "completed" detection, wrong session-completion timing.

#### P0-2 — Effort levels missing `xhigh`, `max`, `auto`

**Devtools:** `dashboard/src/components/controls/EffortSlider.tsx:10`
```ts
const LEVELS: EffortLevel[] = ["low", "medium", "high"];
```
Plus the discovery hint `server/src/http/routes/discovery-routes.ts:43`:
```ts
argumentHint: "<low|medium|high>"
```

**CC truth (CHANGELOG):**
- `low / medium / high` — original
- `xhigh` (Opus 4.7 only) — line 716, 718
- `max` — line 694
- `auto` — line 694, 501

Users cannot select xhigh/max/auto from the dashboard. The `EffortLevel` type union in `dashboard/src/lib/types.ts` needs widening too.

#### P0-4 — Missing `attachment` event wrapper + sidecar metadata records

**Devtools:** `server/src/types.ts` BaseEvent listed only 5 types:
```ts
type: "queue-operation" | "user" | "assistant" | "progress" | "system";
```

**Devtools parser:** `server/src/parser/jsonl-reader.ts:35` does `events.push(parsed as unknown as SessionEvent)` — unknown types make it into the array but every downstream switch silently drops them.

**CC truth (strict line-start parse of 30 real session JSONLs in `~/.claude/projects/`):**

Top-level types CC actually emits (by frequency):

| Type | Sampled freq | Purpose |
|---|---|---|
| `attachment` | 795 | Wrapper for hook/skill/MCP/reminder runtime deltas |
| `assistant` | 311 | ✅ have |
| `user` | 209 | ✅ have |
| `last-prompt` | 106 | Sidecar — resume state |
| `queue-operation` | 84 | ✅ have |
| `permission-mode` | 29 | Sidecar — permission-mode marker |
| `system` | 19 | ✅ have |
| `file-history-snapshot` | 18 | Sidecar — rewind support |
| `worktree-state` | 12 | Sidecar — EnterWorktree state |
| `ai-title` | 7 | Sidecar — auto-generated title |

The `attachment` event carries an inner `attachment.type` discriminator. Inner type frequencies:

| `attachment.type` | Sampled freq | Purpose |
|---|---|---|
| `hook_success` | 816 | Hook execution result |
| `async_hook_response` | 182 | Async hook output |
| `skill_listing` | 31 | Skill discovery |
| `deferred_tools_delta` | 26 | Tool defer/load (ToolSearch) |
| `mcp_instructions_delta` | 24 | MCP server-events stream |
| `hook_additional_context` | 24 | Hook injecting context |
| `hook_system_message` | 21 | Hook calling system msg |
| `hook_cancelled` | 7 | Hook cancellation |
| `todo_reminder` | 6 | Todo-item reminder |
| `task_reminder` | 6 | TodoWrite reminder |
| `command_permissions` | 2 | Per-command permission resolution |
| `queued_command` | 1 | Slash-command queue entry |

**Impact:** Devtools claimed "JSONL is source of truth" but discarded the most common top-level event (attachment, 795 occurrences) and 5 sidecar record types. Every one of these is potentially user-visible content. Most importantly, **hook_success attachments (~816 per session)** are the runtime side of P0-3 (HookEditor) — devtools shows users where to configure hooks but never shows them what their hooks did.

#### P0-3 — Hook event types incomplete (8 of 12 missing)

**Devtools:** `dashboard/src/components/panels/HookEditor.tsx:27`
```ts
const EVENT_TYPES = ["PreToolUse", "PostToolUse", "Notification", "Stop"];
```

**CC truth (from CHANGELOG):** at least 12 hook event types
| Event | Evidence |
|---|---|
| PreToolUse | ✅ have |
| PostToolUse | ✅ have |
| PostToolUseFailure | line 524 |
| Notification | ✅ have |
| Stop | ✅ have |
| SubagentStop | lines 595, 953, 993 |
| SubagentStart | line 63 |
| UserPromptSubmit | line 218 |
| SessionStart | lines 63, 749, 236 |
| Setup | line 63 |
| PreCompact | lines 826, 1241 |
| TaskCreated | lines 1161, 1241 |

Users cannot author 8 hook event types from the dashboard.

### P1 — Shipped CC features completely dark

#### P1-1 — `claude agents` background-agents dashboard

CC ships a multi-session dashboard with warm-spare daemon, dispatched / Working / Completed states, sleep/wake transitions, `--add-dir`, `--settings`, `--mcp-config`, `--plugin-dir`, `--permission-mode`, `--model`, `--effort` flags. Devtools' session list models none of this.

**Changelog evidence:** lines 25–37, 41, 50–54, 71, 76–77, 82–83.

#### P1-2 — `/bg` and `←←` detach

Background-fork command with flag preservation across `retire→wake`. Devtools doesn't show fork relationships or background status.

**Changelog evidence:** lines 18, 31, 34, 35, 27, 55, 76.

#### P1-3 — `/loop` & `CronCreate` scheduled wakeup markers

CC writes timestamp markers to the transcript when scheduled tasks fire (line 1207). Devtools doesn't recognize these — they look like regular user messages.

**Changelog evidence:** lines 1207, 1670, 1671, 1620, 14, 140, 245.

#### P1-4 — `/goal` evaluator panel

Live elapsed/turns/tokens overlay panel; runs until completion condition met across turns.

**Changelog evidence:** lines 149, 134, 15.

#### P1-5 — Compaction taxonomy

`sse-event-handler.ts:303` collapses all compactions into one event. CC actually has six distinct triggers visible to the user:
1. Manual `/compact`
2. Autocompact threshold-driven
3. Reactive (after token overflow on a request)
4. Rewind menu "Summarize up to here"
5. PreCompact-hook-blocked
6. Improved reactive seed (line 62)

Plus `compact_metadata` is captured but unused beyond `trigger` and `pre_tokens`.

**Changelog evidence:** lines 62, 1722, 826, 1241, 73.

#### P1-6 — Context-pressure timeline

CC users hit autocompact regularly. Devtools shows a 3-second "Context compacted" toast (`StreamingTurnArea.tsx:13`) but no permanent timeline of context% over turns nor compact_boundary markers as vertical lines.

### P2 — Polish

| # | Gap | Location |
|---|---|---|
| P2-1 | Rewind menu missing "Summarize up to here" option | `dashboard/.../RewindMenu.tsx` |
| P2-2 | PowerShell tool not rendered specially | `dashboard/.../ToolCallBlock.tsx:87` — only branches on Bash |
| P2-3 | PostToolUse `duration_ms` parsed but not surfaced in trace | `sse-event-handler.ts:66` |
| P2-4 | `terminalSequence` hook output field not parsed | (changelog line 68) |
| P2-5 | OpenTelemetry fields `stop_reason`, `gen_ai.response.finish_reasons`, `user_system_prompt` not collected | (changelog 467) |
| P2-6 | `claude project purge [path]` has no dashboard action | (changelog 391) |
| P2-7 | `MODEL_PRICING` and `CONTEXT_WINDOW_SIZES` duplicated client+server (drift risk) | `dashboard/src/lib/cost.ts:8` ↔ `server/src/analyzer/metrics.ts:20` |
| P2-8 | `formatModelShort` only knows opus/sonnet/haiku families | `dashboard/.../TopBar.tsx:321` |
| P2-9 | Hook events not joined to compact events (PreCompact attribution) | n/a |
| P2-10 | Per-model + cache-hit breakdown view for `/usage` | server has the endpoint; no dashboard view |

## Needs live-JSONL verification

Capture a current CC session JSONL and grep for these before adding handlers:

- `tengu_*` analytics-only events (likely never in session JSONL)
- `system.subtype` values beyond `compact_boundary` and `init`
- `TaskCreated` hook payload format
- `transcript_path` field in hook input
- Scheduled-task fire marker exact event type (line 1207)
- `pause_turn` / `refusal` stop_reasons in real sessions
- Background-agent daemon sidecar files (if any) under `~/.claude/projects/<hash>/`

## Execution plan

Phases run sequentially; within a phase, loop on remaining gaps until none left, then move to the next phase.

**Phase 0 (P0):** widen enums, add missing hook types, model attachment+sidecar — pure type/data fixes.
**Phase 1 (P1):** dark features — `claude agents`, `/loop`, `/goal`, compaction taxonomy, context-pressure timeline.
**Phase 2 (P2):** polish.

After each phase: run `pnpm -C server test && pnpm -C dashboard test` and `tsc --noEmit` in both. Failure of either is a P0.

## Execution log

### Phase 0 — complete (tag: `p0-complete`)

| Gap | Status | Commit |
|---|---|---|
| P0-1 stop_reason enum | ✅ | b036cc9 |
| P0-2 effort levels (xhigh/max) | ✅ | debdd34 |
| P0-3 hook event types (12 of 12) | ✅ | 5f546e5 |
| P0 cleanup (handler casts, error messages) | ✅ | 8a5f18a |
| P0-4 unknown event types — first model | superseded | 3a0027e |
| P0-4 corrected — attachment wrapper + sidecars | ✅ | 86d0e00 |

### Phase 1 — partial (tag: `p1-complete`)

| Gap | Status | Commit |
|---|---|---|
| P0-5 (spinoff) `hook_success` attachments rendered in Hooks tab | ✅ | 2d109d6 |
| P1-5 Compaction taxonomy + real metadata | ✅ | 304d0ae |
| P1-6 Context-pressure timeline | ✅ | d647143 |
| P1-1 `claude agents` view (partial — entrypoint badge) | ✅ partial | 9fe240a |
| P1-2 `/bg` / `←←` detach (partial — entrypoint badge) | ✅ partial | 9fe240a |
| P1-3 `/loop` & `CronCreate` wakeup markers | ⏸ deferred — see note |
| P1-4 `/goal` evaluator panel | ⏸ deferred — see note |

P1-5 closed a silent data bug: the SSE handler read `compact_metadata` (snake_case) but real CC v2.1.143 JSONLs write `compactMetadata` (camelCase). Every compaction event reached the dashboard with `metadata=undefined`. Now surfaces real preTokens → postTokens compression, duration, and trigger taxonomy.

P1-6 ships a small SVG chart above the conversation view showing per-turn context% with vertical compaction markers. Suppressed for sessions under 30% peak pressure or fewer than 2 turns.

**P1-3 investigation note:** grepping 30 real CC sessions for `/loop` markers came up empty (no `/loop` was used in those sessions). We did find a related top-level attachment family with `commandMode` discriminator:

- `attachment.attachment.type === "queued_command"` carries one of two commandModes:
  - `"task-notification"` (812 sample) — Monitor / TaskCreate fan-out: e.g. background test runs completing
  - `"prompt"` (352 sample) — user-queued slash command waiting on dispatch

Neither is a `/loop` wakeup. To finish P1-3 properly, capture a session that runs `/loop 5m /foo` and grep the resulting JSONL for the timestamp marker described in CC CHANGELOG line 1207. Type the marker as a new SystemEvent subtype (or AttachmentInnerType) and render it inline in the conversation with a clock icon.

The remaining P1 items all need substantial new UI surfaces or live CC session capture; planned for the next dedicated session, branching from tag `p1-complete`.

### Phase 2 — partial (tag: `p2-partial`)

| Gap | Status | Commit |
|---|---|---|
| P2-1 "Summarize up to here" in Rewind menu | ✅ | b667160 |
| P2-2 PowerShell tool rendered specially | ✅ | a99080f |
| P2-3 PostToolUse `duration_ms` (async_hook_response.response.duration_ms) | ✅ | b23d49b |
| P2-7 Centralize MODEL_PRICING + parity test | ✅ | 570fe01 |
| P2-8 `formatModelShort` version-agnostic | ✅ | efea752 |
| P2-4 `terminalSequence` hook field | ⏸ pending |
| P2-5 OpenTelemetry fields (`stop_reason`, `gen_ai.response.finish_reasons`, `user_system_prompt`) | ⏸ pending |
| P2-6 `claude project purge` dashboard action | ⏸ pending |
| P2-9 PreCompact hook → compact attribution | ⏸ pending |
| P2-10 Per-model + cache-hit `/usage` view | ⏸ pending |

P2-3 closed a second silent-data bug: CC's PostToolUse async-hook response carries the underlying TOOL execution time (excluding hook overhead) at `attachment.response.duration_ms`. Devtools had a stub interface but no surface — now visible in the Hooks tab "ms" column and aggregated as session-total in the header.

P2-7 added a server↔dashboard pricing parity test that reads the dashboard file as text and asserts every entry matches the server file verbatim. Catches drift on every CI run.
