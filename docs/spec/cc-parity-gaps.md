# Claude Code Parity — Status & Remaining Spec

**Anchor:** `anthropics/claude-code` CHANGELOG v2.1.143 (2026-05-15)
**Branch:** `master` @ `9c185a1`
**Tags:** `pre-cc-parity-p0` → `p0-complete` → `p1-complete` → `p2-partial`
**Last update:** 2026-05-16

This document was originally a strict gap report against CC. Most of that pass has shipped; the rest is summarized below with concrete acceptance criteria so the work is actionable in a future session.

## Source-of-truth notes

- CC is closed source; CHANGELOG is the authoritative behavior reference. Real JSONL samples in `~/.claude/projects/` were used to verify event shapes whenever possible.
- OpenClaude (`Gitlawb/openclaude`) was used only as a window into CC internals. Any OC-only addition is out of scope.

## What shipped (closed)

### Phase 0 — type-system and silent-data fixes

| ID | Commit | Summary |
|---|---|---|
| **P0-1** | `b036cc9` | `stop_reason` enum widened to 6 values (added `max_tokens`, `stop_sequence`, `pause_turn`, `refusal`). Introduced `isTerminalStopReason()`; 5 consumer sites updated; 8 mirrored tests. |
| **P0-2** | `debdd34` | Added `xhigh` (Opus 4.7) and `max` to `EffortLevel`. EffortSlider, discovery hint, server cast, slashCommandHandler all updated. |
| **P0-3** | `5f546e5` | HookEditor `EVENT_TYPES` extended from 4 → 12 (SessionStart, Setup, UserPromptSubmit, PostToolUseFailure, SubagentStart, SubagentStop, PreCompact, TaskCreated added). |
| P0 cleanup | `8a5f18a` | Stale narrow casts and error messages caught by post-P0 grep review. |
| **P0-4** | `86d0e00` (corrects `3a0027e`) | Real CC top-level event is `attachment` (≈795/session) wrapping 12 inner types via `attachment.attachment.type`. Defined `AttachmentEvent`, `AttachmentPayload` discriminated union, typed payloads (HookSuccessAttachment with hookName/hookEvent/toolUseID/command/stdout/stderr/exitCode/durationMs etc.). 5 sidecar records (`ai-title`, `last-prompt`, `permission-mode`, `file-history-snapshot`, `worktree-state`) added to the parser's IGNORED set. |

### Phase 1 — feature surfaces

| ID | Commit | Summary |
|---|---|---|
| **P0-5** spinoff | `2d109d6` | New **Hooks tab** in BottomPanel — one row per `hook_success`/`hook_cancelled`/`async_hook_response`. Columns: event, name, tool_use_id, ms, exit, output. Header summary, event-type filter, free-text search. |
| **P1-5** | `304d0ae` | **Silent data bug fixed:** SSE handler read `compact_metadata` (snake_case) but CC writes `compactMetadata` (camelCase) — every compaction event arrived with `metadata=undefined`. Now reads both casings; surfaces preTokens / postTokens / durationMs / preCompactDiscoveredTools. Banner shows `"Context auto-compacted — 168,470 → 8,759 tokens (-95%), 60.8s"`. |
| **P1-1 / P1-2** partial | `9fe240a` | Captured session `entrypoint` (cli / sdk-cli / claude-desktop / sdk-ts) from JSONL head/tail scan. Surfaces as a "bg" / "desk" badge on RepoList session rows. The full `claude agents` daemon view (warm spares, retire/wake transitions) is not in JSONL and remains out of scope without a CC daemon API. |

### Phase 2 — polish

| ID | Commit | Summary |
|---|---|---|
| **P2-1** | `b667160` | Rewind menu "Summarize up to here" button + new `POST /api/sessions/:id/summarize-up-to` route (fire-and-forget dispatch). |
| **P2-2** | `a99080f` | PowerShell tool render: ToolCallBlock + PermissionBlock + AgentLogs now branch alongside Bash. `PS>` prefix on command preview. |
| **P2-3** | `b23d49b` | **Second silent data bug fixed:** PostToolUse async-hook response carries the underlying tool execution time at `attachment.response.duration_ms` (CHANGELOG line 524). Extended `AsyncHookResponseAttachment` to the full payload. HooksTab now shows duration per row and session-total in the header. |
| **P2-7** | `570fe01` | Centralized `FALLBACK_MODEL_PRICING` and `FALLBACK_CONTEXT_WINDOW_SIZES` into dedicated mirror modules. Added a server↔dashboard parity test that reads the dashboard file as text and asserts every entry matches verbatim. |
| **P2-8** | `efea752` | `formatModelShort` now version-agnostic: title-cases any family ("Future 1.0"), preserves `[1m]` → `(1M)` suffix. |

### Tests + types end state

- Server vitest: 644/644 pass (14 pre-existing DebugDB tests skipped — need `better-sqlite3` native build)
- Dashboard vitest: 1404 pass + 4 skipped (5 pre-existing failures in `TurnCard.test.tsx` and `SettingsPanel.test.tsx` excluded)
- `tsc --noEmit`: server clean; dashboard has 3 pre-existing `TurnCard.tsx:cacheReadTokens` errors unrelated to this work
- 50 new tests added across server + dashboard

## Retracted

### OC-only (out of scope, never targeted)

Multi-provider routing, gRPC, SQLite knowledge graph, Orama, coordinator/worker mode, autoDream/autoFix/ultraplan, microCompact/snipCompact/contextCollapse, SessionMemory/extractMemories/wiki, voice STT as a JSONL event class, Buddy companion, `~/.openclaude/projects/` discovery, `agent-<id>.meta.json` sidecar.

### Shipped then retracted per user

- **P1-6 Context-pressure chart** (commit `d647143`, removed in `9c185a1`). User did not want a chart above the conversation. The underlying P1-5 compaction-metadata fix that *fed* the chart is unaffected and stays shipped.

## Remaining gaps with acceptance criteria

The items below are everything from the original report that did not ship, restated with concrete acceptance criteria so each is independently actionable.

### Deferred — need live JSONL capture

The following items depend on event shapes we have not yet observed in 30 sampled real CC sessions. Each requires capturing a JSONL where the feature was actually used, then grepping for the event signature.

#### P1-3 — `/loop` and `CronCreate` wakeup markers

- **Reference:** CHANGELOG line 1207 "Added timestamp markers in transcripts when scheduled tasks (`/loop`, `CronCreate`) fire."
- **Investigation done:** `attachment.attachment.type === "queued_command"` exists with `commandMode` ∈ {`task-notification`, `prompt`} — these are Monitor / TaskCreate notifications, not `/loop` wakeups.
- **To unblock:** run a real session with `/loop 5m /foo`, locate the resulting JSONL, grep for the wakeup marker.
- **Acceptance criteria:**
  - New top-level system subtype (or AttachmentInnerType) recognized in `parseJsonlFile` and SSE handler.
  - Rendered inline in the conversation as a distinct row (e.g. clock icon, "wakeup ⇢ /foo at 14:32:00").
  - At least one test using a captured real-CC line.

#### P1-4 — `/goal` evaluator overlay

- **Reference:** CHANGELOG line 149 "Added `/goal` command: set a completion condition and Claude keeps working across turns until it's met. Shows live elapsed/turns/tokens as an overlay panel."
- **Investigation done:** No `/goal` events seen in the sampled JSONLs. CC's overlay panel is a CLI-side UI; it may not produce its own JSONL event.
- **To unblock:** run a real `/goal` session and confirm whether anything beyond the standard user message lands in JSONL.
- **Acceptance criteria (if JSONL signal exists):**
  - Recognize the goal-set / goal-tick / goal-met events.
  - Render a small overlay panel in `ConversationView` showing live elapsed time, turn count, and tokens-since-goal.

#### P1-1/P1-2 full — `claude agents` daemon view + `/bg` fork graph

- **Reference:** CHANGELOG lines 25–37, 41, 50–54, 76–77, 82–83 + `/bg` / `←←` flag preservation across retire→wake (lines 31, 34, 35, 18).
- **Investigation done:** Daemon-side state (warm-spare counts, dispatched/Working/Completed transitions, retire→wake) is not in JSONL. The `entrypoint` field is the only JSONL trace — already surfaced as a badge.
- **To unblock:** requires a CC daemon API or local socket; out of scope for a pure JSONL observer.
- **Acceptance criteria (if a daemon hook becomes available):**
  - New `/api/agents/dashboard` proxy returning daemon state.
  - New top-level dashboard view listing background sessions with their current state, owning flags, and a kill action.

### Phase 2 — actionable now (no blocker)

#### P2-4 — `terminalSequence` hook output field

- **Reference:** CHANGELOG line 68 "Added `terminalSequence` field to hook JSON output so hooks can emit desktop notifications, window titles, and bells without a controlling terminal."
- **Spec:**
  - Extend `HookSuccessAttachment` to optionally carry the `terminalSequence` field (string).
  - Surface it in the Hooks tab — e.g. a small bell icon next to rows that triggered a notification, with the sequence shown on hover.
- **Acceptance criteria:**
  - Type updated server + dashboard with `terminalSequence?: string`.
  - HooksTab renders an icon for rows where the field is non-empty.
  - Unit test using a synthetic hook_success with `terminalSequence: "]9;1;..."`.

#### P2-5 — OpenTelemetry-style fields in result event

- **Reference:** CHANGELOG line 467 "OpenTelemetry: added `stop_reason`, `gen_ai.response.finish_reasons`, and `user_system_prompt` (gated behind `OTEL_LOG_USER_PROMPTS`) to LLM request spans."
- **Spec:** These appear on the SDK `result` event tail, not in mid-session JSONL.
  - Extend `SSEResultEvent` (`server/src/http/sse-event-handler.ts:81`) to carry `stop_reason` and `finish_reasons[]` if present.
  - Show them in `CostTab` or `DetailTab` alongside `total_cost_usd` and `num_turns`.
- **Acceptance criteria:**
  - Fields parsed by the SSE handler without breaking existing tests.
  - Visible somewhere in the bottom panel for sessions where the SDK emitted them.

#### P2-6 — `claude project purge` dashboard action

- **Reference:** CHANGELOG line 391 "Added `claude project purge [path]` to delete all Claude Code state for a project (transcripts, tasks, file history, config entry)."
- **Spec:**
  - New `POST /api/projects/:hash/purge` server route that shells out to `claude project purge --dry-run` first, captures the file list, and only proceeds with explicit confirmation.
  - New "Purge project" action on the RepoList project header, behind a confirmation modal listing what will be deleted.
- **Acceptance criteria:**
  - Dry-run path returns the file list; live path requires `{ confirm: true }` in the body.
  - Server unit test using a stubbed `spawnSync` (no real CLI required).

#### P2-9 — PreCompact hook attribution on compact events

- **Reference:** CHANGELOG lines 826 (PreCompact added) and 1241.
- **Spec:** When a compaction is preceded by a PreCompact `hook_success` attachment within the same turn, decorate the compact banner with the hook name ("Pre-compacted by `before-compact.sh`"). When a PreCompact hook exits 2 or returns `{decision: "block"}` (line 826), the compaction is suppressed — show a small "compaction blocked by PreCompact hook" notice instead of the banner.
- **Acceptance criteria:**
  - `useStreamingState` joins the most-recent PreCompact attachment to a compact event arriving within the same turn window.
  - New SSE event type or extended `compact` event carrying `attributedTo?: string`.
  - Test covering both the success-attribution and the blocked path.

#### P2-10 — Per-model + cache-hit `/usage` view

- **Reference:** CHANGELOG line 1057 "Added per-model and cache-hit breakdown to `/cost` for subscription users." `/cost` and `/stats` are now both inside `/usage` (line 572).
- **Spec:**
  - Server already proxies `/usage` via `getAnthropicUsage()` (`discovery-routes.ts:64,108`).
  - New BottomPanel tab "Usage" (or extension of CostTab) rendering per-model rows with input/output/cache_create/cache_read columns plus a cache-hit ratio bar.
- **Acceptance criteria:**
  - Dashboard fetches the existing endpoint and groups rows by model.
  - Cache-hit ratio rendered as a horizontal bar with token-count tooltips.
  - Coverage test asserting the rows match the API shape.

### Latent / pre-existing (not introduced by this work)

These existed on `master` before P0; not addressed in this pass but worth tracking.

| ID | Issue | Location |
|---|---|---|
| LX-1 | Three TS2339 errors on `TurnSnapshot.cacheReadTokens` (property never declared) | `dashboard/src/components/conversation/TurnCard.tsx:202, 328` |
| LX-2 | 5 pre-existing test failures (`TurnCard.test.tsx > 'Generating...' for a running turn`, `SettingsPanel.test.tsx > renders canonical SDK permission mode options` + 3) | pre-master |
| LX-3 | 14 DebugDB tests fail without `better-sqlite3` native build; `pnpm approve-builds` requires interactive confirmation | `server/src/debug/debug-db.ts` |
| LX-4 | `queued_command` attachments with `commandMode: "task-notification"` (~812/session) are typed (P0-4) but not rendered anywhere — they're Monitor / TaskCreate fan-out events | `dashboard/src/components/bottom-panel/HooksTab.tsx` (filter) |

### Other small follow-ups discovered during this pass

| ID | Note |
|---|---|
| FU-1 | `summarize-up-to` route currently dispatches `/compact` to the whole session — the messageId is captured but not used to bound the summarization. CC's native command bounds it at the picked turn. Needs an SDK API or a custom prompt template. |
| FU-2 | `P1-1` entrypoint badge only shows the FIRST entrypoint encountered in the head scan. If the session was retired+resumed with a different entrypoint, the badge can lie. Switch to "last seen" or surface both. |
| FU-3 | The Hooks tab does not yet correlate to tool calls in the conversation view. Hovering a hook row could highlight the matching tool_use in the turn list. |
| FU-4 | The compaction banner is shown only for live (SSE-streamed) sessions. Historical sessions parse `compactMetadata` correctly via P0-4 but the per-event banner timing logic still requires a live stream. Add a static "compacted at turn N" marker in the conversation timeline for replayed sessions. |

## Resume points

```
git checkout p2-partial        # rebase target for new P2 work
git checkout p1-complete       # if you need to drop P2-* commits but keep P0+P1
git checkout pre-cc-parity-p0  # nuclear reset point
```

All remaining acceptance criteria above are self-contained — pick any item and implement against the criteria without re-reading the original CHANGELOG.
