# CC Parity — Implementation Plan

**Source spec:** `docs/spec/cc-parity-gaps.md`
**Resume tag:** `p2-partial`
**Created:** 2026-05-16

This plan closes every remaining gap in the spec. Items are ordered by
unblock value: latent debt cleared first (cleans the baseline), then the
five actionable P2 items, then the follow-ups, then the deferred items
that require a live CC session capture.

Each task is sized **S** (under ~30 min), **M** (~60 min), or **L** (multi-hour).
"Verify" lines call out the precise command to run before commit.

---

## Phase A — Clear latent debt (LX-1..LX-4)

Goal: every pre-existing failure on master goes green, so the rest of the
work has a clean baseline.

### TASK-A1 — Add `cacheReadTokens` to `TurnSnapshot` (LX-1) [S]

**Diagnostic:**
```bash
npx tsc -p dashboard --noEmit 2>&1 | grep TurnSnapshot
# Expected 3 TS2339 errors at TurnCard.tsx:202,328
```

**Steps:**
1. `dashboard/src/lib/turnSnapshot.ts` — add `cacheReadTokens?: number` to `TurnSnapshot`.
2. `server/src/analyzer/metrics.ts` — locate the per-turn aggregator and emit `cacheReadTokens` alongside the existing token totals.
3. Mirror change in `dashboard/src/lib/types.ts` if `TurnSnapshot` is duplicated there.
4. Wire one TurnCard test confirming the field is rendered.

**Verify:**
```bash
npx tsc -p dashboard --noEmit                     # 0 errors
pnpm -C dashboard vitest run src/lib/turnSnapshot 2>&1 | tail -3
```

**Acceptance:** `npx tsc -p dashboard --noEmit` exits 0 with no
`cacheReadTokens` errors.

---

### TASK-A2 — Fix `TurnCard.test.tsx > 'Generating...' for a running turn` (LX-2) [S]

**Diagnostic:**
```bash
pnpm -C dashboard vitest run src/components/conversation/TurnCard.test.tsx 2>&1 | tail -20
# Currently fails: expected 'Session ended without completion' to contain 'Generating...'
```

**Root cause:** `TurnCard` calls `getAgentStatus("main", events, sessionIsActive=false)`.
With `stop_reason: "tool_use"` and `isRunning=false`, the predicate
returns `indeterminate`, not `running`. The test was written for older
semantics where any non-end_turn was "running".

**Steps:**
1. Read `dashboard/src/components/conversation/TurnCard.test.tsx:100-111`.
2. Update the test to pass `sessionIsRunning={true}` so the assertion
   matches the actual semantics (running session, non-terminal stop).
3. Add a second case asserting the same events with `sessionIsRunning={false}`
   correctly render "Session ended without completion".

**Verify:**
```bash
pnpm -C dashboard vitest run src/components/conversation/TurnCard.test.tsx 2>&1 | tail -3
```

**Acceptance:** TurnCard tests pass without exclusion in the full suite run.

---

### TASK-A3 — Fix `SettingsPanel.test.tsx` label lookups (LX-2 cont.) [S]

**Diagnostic:**
```bash
pnpm -C dashboard vitest run src/components/panels/__tests__/SettingsPanel.test.tsx 2>&1 | tail -30
# Currently fails: Unable to find a label with the text of: Effort / Model
```

**Likely cause:** SettingsPanel labels were restructured (probably wrapped
in an additional element after the recent EffortSlider rework).

**Steps:**
1. Read the SettingsPanel render layout around the `EffortSlider` and
   model dropdown.
2. Update the test to use `getByRole('combobox', { name: /effort/i })` (or
   the testid that already exists) instead of `getByLabelText("Effort")`.
3. Mirror for "Model" and "Permission mode".

**Verify:**
```bash
pnpm -C dashboard vitest run src/components/panels/__tests__/SettingsPanel.test.tsx 2>&1 | tail -3
```

**Acceptance:** SettingsPanel tests pass without exclusion.

---

### TASK-A4 — Make DebugDB tests skip gracefully without `better-sqlite3` (LX-3) [S]

**Diagnostic:**
```bash
pnpm -C server vitest run src/debug/debug-db.test.ts 2>&1 | tail -10
# 14 failures: Cannot read properties of null (reading 'upsertSession')
```

**Steps:**
1. `server/src/debug/debug-db.test.ts` — at top of `describe`, detect
   whether the native module loaded and call `it.skip(...)` for the
   whole block if not:
   ```ts
   const db = DebugDB.open(":memory:");
   const SKIP = db == null;
   describe.skipIf(SKIP)("DebugDB", () => { ... })
   ```
2. Same pattern for `routes-debug.test.ts` and `routes-lifecycle-storage.test.ts`.
3. Add a `pnpm postinstall` hint in `server/package.json` README pointing
   to `pnpm approve-builds better-sqlite3` for users who want full coverage.

**Verify:**
```bash
pnpm -C server test 2>&1 | tail -3   # full suite without --exclude
```

**Acceptance:** `pnpm -C server test` exits 0 on a machine without
`better-sqlite3` built; passes on a machine with it built.

---

### TASK-A5 — Render `task-notification` queued_command attachments (LX-4) [M]

**Diagnostic:**
```bash
find ~/.claude/projects -name "*.jsonl" | xargs -P 4 -n 50 grep -h 'task-notification' 2>/dev/null | wc -l
# Real CC sessions: ~812 such events per active session
```

**Steps:**
1. `dashboard/src/components/bottom-panel/HooksTab.tsx` — extend the
   `isHookAttachment` filter to also include `queued_command` where
   `commandMode === "task-notification"`. (Filter out the regular
   `prompt` mode — that's user input, not notification.)
2. Add a new row column `Source` distinguishing hook executions from
   Monitor / TaskCreate task-notifications.
3. Or alternative: create a new BottomPanel tab "Notifications" that
   shows only `queued_command` attachments. Pick one — recommended is
   the unified Hooks tab with the Source column since the data is small.
4. Truncate the long `<task-notification>` XML preview to the
   `<summary>` content.

**Verify:**
```bash
pnpm -C dashboard vitest run src/components/bottom-panel/HooksTab.test.tsx 2>&1 | tail -3
```

**Acceptance:** New test using a real `task-notification` payload
(captured from `~/.claude/projects/`) renders a row with the summary
text and `Source: TaskCreate`.

---

## Phase B — Actionable P2 items (P2-4, P2-5, P2-6, P2-9, P2-10)

Goal: close every remaining P2 from the spec. Each item below corresponds
to one acceptance section in the spec.

### TASK-B1 — `terminalSequence` hook output field (P2-4) [S]

**Reference:** Spec P2-4 acceptance criteria.

**Steps:**
1. Extend `HookSuccessAttachment` in both `server/src/types.ts` and
   `dashboard/src/lib/types.ts` to include `terminalSequence?: string`.
2. `HooksTab.tsx` — when `terminalSequence` is non-empty, render a small
   bell icon (`lucide-react/Bell`) next to the hook name. Tooltip shows
   the literal sequence (e.g. `\x1b]9;1;Build complete\x07`).
3. Truncate sequences > 80 chars in tooltip.
4. Add a unit test using a synthetic hook_success carrying a sequence.

**Verify:**
```bash
pnpm -C dashboard vitest run src/components/bottom-panel/HooksTab.test.tsx 2>&1 | tail -3
npx tsc -p dashboard --noEmit 2>&1 | tail -3
```

---

### TASK-B2 — OpenTelemetry-style result fields (P2-5) [M]

**Reference:** Spec P2-5.

**Steps:**
1. `server/src/http/sse-event-handler.ts` — extend `SSEResultEvent`:
   ```ts
   stop_reason?: string;
   finish_reasons?: string[];
   ```
   In the `if (msg.type === "result")` block, also forward
   `msg.stop_reason` and `msg.gen_ai?.response?.finish_reasons`
   (or whatever the actual field path is — confirm via a live result
   event capture).
2. `dashboard/src/lib/streaming-types.ts` — extend the result-event
   reducer in `useStreamingState.ts` to capture these.
3. `dashboard/src/components/bottom-panel/CostTab.tsx` (or DetailTab) —
   render `Stop reason: end_turn`, `Finish reasons: [...]` as small
   labels next to the existing `total_cost_usd` / `num_turns`.
4. Tests: SSE handler test for the new fields; rendering test asserting
   the labels appear when set.

**Verify:**
```bash
pnpm -C server vitest run src/http/sse-event-handler.test.ts 2>&1 | tail -3
pnpm -C dashboard vitest run src/components/bottom-panel/CostTab.test.tsx 2>&1 | tail -3
```

---

### TASK-B3 — `claude project purge` dashboard action (P2-6) [L]

**Reference:** Spec P2-6.

**Steps:**
1. `server/src/http/routes/project-routes.ts` (new file) — add:
   - `POST /api/projects/:hash/purge/dry-run` — runs
     `spawnSync("claude", ["project", "purge", "--dry-run", "-y", path])`
     and returns the captured file list.
   - `POST /api/projects/:hash/purge` — requires `{ confirm: true }` in
     the body; runs the live command.
   - Resolve `path` from the project hash via `discoverSessions()` first.
2. Mount the router in `server/src/http/server.ts`.
3. `dashboard/src/components/RepoList.tsx` — new "Purge project" action
   in the repo header context menu. Opens a confirmation modal that
   first calls dry-run, displays the list, then enables the destructive
   confirm button.
4. `dashboard/src/components/PurgeConfirmModal.tsx` (new).
5. Tests:
   - Server: stub `spawnSync` and assert both routes spawn the right
     argv with the right path.
   - Dashboard: modal opens, dry-run list renders, confirm button
     disabled until checkbox is ticked.

**Verify:**
```bash
pnpm -C server vitest run src/http/routes/project-routes.test.ts 2>&1 | tail -3
pnpm -C dashboard vitest run src/components/PurgeConfirmModal.test.tsx 2>&1 | tail -3
```

---

### TASK-B4 — PreCompact hook attribution on compact events (P2-9) [M]

**Reference:** Spec P2-9.

**Steps:**
1. `server/src/http/sse-event-handler.ts` — when a compact_boundary
   message arrives, walk recent events (server-side buffer) for the
   most recent `hook_success` or `hook_cancelled` with
   `hookEvent === "PreCompact"` within the last 60s. Attach to the
   SSE event:
   ```ts
   attributedTo?: { hookName: string; cancelled?: boolean; reason?: string }
   ```
2. `dashboard/src/hooks/useStreamingState.ts` — propagate `attributedTo`
   onto `compactResult`.
3. `dashboard/src/components/conversation/StreamingTurnArea.tsx` —
   CompactResultBanner shows the attribution when present:
   `"Pre-compacted by check-rotate.sh — was 168,470 → 8,759 tokens"`.
   When the PreCompact hook blocked: render
   `"Compaction blocked by PreCompact hook (reason: <reason>)"` in
   amber, no token info.
4. Tests:
   - SSE handler test: simulate hook_success + compact_boundary, assert
     `attributedTo` populated.
   - SSE handler test: hook_cancelled at PreCompact, assert
     `attributedTo.cancelled === true`.
   - StreamingTurnArea test: banner renders the attribution text.

**Verify:**
```bash
pnpm -C server vitest run src/http/sse-event-handler.test.ts 2>&1 | tail -3
pnpm -C dashboard vitest run src/components/conversation/StreamingTurnArea 2>&1 | tail -3
```

---

### TASK-B5 — Per-model + cache-hit `/usage` view (P2-10) [L]

**Reference:** Spec P2-10.

**Investigation first:**
```bash
curl -s http://localhost:3142/api/usage | jq .
# Capture the shape; spec assumes it returns per-model rows but the
# Anthropic /usage endpoint may need translating server-side.
```

**Steps:**
1. `server/src/api/usage-client.ts` — if the upstream shape is monolithic,
   add a `normalizeUsage()` that groups by model and computes
   `cacheHitRatio = cache_read / (input + cache_read + cache_create)` per row.
2. `dashboard/src/components/bottom-panel/UsageTab.tsx` (new) — fetch
   from `/api/usage`, render a table per model:
   - Model · Input · Output · Cache create · Cache read · Cache-hit% (bar)
3. Add "Usage" to `BottomPanel.TABS`.
4. Tests:
   - Server: `usage-client.test.ts` for `normalizeUsage()` with a stubbed
     response.
   - Dashboard: UsageTab fetches and renders rows.

**Verify:**
```bash
pnpm -C server vitest run src/api/usage-client.test.ts 2>&1 | tail -3
pnpm -C dashboard vitest run src/components/bottom-panel/UsageTab.test.tsx 2>&1 | tail -3
```

---

## Phase C — Follow-ups (FU-1..FU-4)

### TASK-C1 — Bound `summarize-up-to` at the picked messageId (FU-1) [M]

**Current state:** `/api/sessions/:id/summarize-up-to` dispatches `/compact`
to the whole session. The `messageId` is captured but unused.

**Spec:** CC's native "Summarize up to here" only compacts events whose
parent chain includes the picked user message.

**Steps:**
1. `server/src/session/session-manager.ts` — add `summarizeUpTo(sessionId, messageId)`:
   - Read the session JSONL.
   - Find the picked user event by uuid.
   - Build a prompt template:
     ```
     /compact Summarize the conversation up to and including user message {N}.
     Preserve verbatim every turn after that message.
     ```
   - Dispatch via `sendMessage`.
2. Route `POST /api/sessions/:id/summarize-up-to` calls this instead of
   the unbounded `/compact`.
3. Test: stubbed sendMessage, assert it received the bounded prompt.

**Verify:**
```bash
pnpm -C server vitest run src/session/session-manager.test.ts 2>&1 | tail -3
```

---

### TASK-C2 — Entrypoint "last seen" instead of "first seen" (FU-2) [S]

**Current state:** `SessionCache` captures `entrypoint` from the first
head event with the field set. A retired+resumed session that switches
entrypoint (cli → sdk-cli) gets a stale badge.

**Steps:**
1. `server/src/cache/session-cache.ts` — in the tail scan, also update
   `entrypoint` to the most-recent seen value.
2. Add a test using two-line JSONL where head has `cli` and tail has
   `sdk-cli`; assert the SessionInfo reports `sdk-cli`.

**Verify:**
```bash
pnpm -C server vitest run src/cache/session-cache.test.ts 2>&1 | tail -3
```

---

### TASK-C3 — Hook↔tool_use correlation on hover (FU-3) [M]

**Steps:**
1. `dashboard/src/components/bottom-panel/HooksTab.tsx` — wire row
   hover to dispatch a `onHookHover(toolUseID)` callback up.
2. `dashboard/src/components/conversation/ConversationView.tsx` — accept
   `highlightedToolUseId`. Pass into `MemoTurnCard` → `TurnCard` → the
   tool blocks. When matching, draw a 2px purple outline on the tool
   call.
3. Reverse direction: hovering a tool call highlights the matching hook
   row in the Hooks tab.
4. Tests: HooksTab fires callback on hover; ToolCallBlock receives the
   prop and toggles the class.

**Verify:**
```bash
pnpm -C dashboard vitest run src/components/bottom-panel/HooksTab.test.tsx 2>&1 | tail -3
```

---

### TASK-C4 — Static compact markers for replayed sessions (FU-4) [S]

**Current state:** Compact banner only appears for live SSE-streamed
sessions. Historical sessions parse `compactMetadata` correctly but
never render the banner.

**Steps:**
1. `dashboard/src/components/conversation/ConversationView.tsx` — when
   building the turn list, detect `system.compact_boundary` events
   between turns and inject a small inline marker (similar to the T10
   pill but using a Minimize2 icon and showing
   "auto-compacted at turn 42 — 168K → 9K").
2. The marker uses the existing `compactMetadata` data — no new SSE
   wiring needed.
3. Test: render with a fake events array containing one compact_boundary;
   assert the marker text appears.

**Verify:**
```bash
pnpm -C dashboard vitest run src/components/conversation/ConversationView.test.tsx 2>&1 | tail -3
```

---

## Phase D — Deferred (needs live JSONL capture)

These three items cannot be implemented without running the corresponding
CC feature and capturing the resulting JSONL. Plan describes the capture
step + implementation skeleton so the work resumes cleanly when the data
is in hand.

### TASK-D1 — `/loop` and `CronCreate` wakeup markers (P1-3) [M after capture]

**Capture step:**
```bash
# In a real CC session:
/loop 30s echo hello
# Wait 2 minutes, then exit.
# Locate the JSONL:
ls -t ~/.claude/projects/*/<recent>.jsonl | head -1
# Grep for the wakeup marker:
grep -E '"(wake|fire|loop|schedule)' <that-jsonl> | head -3
```

**Implementation skeleton (after capture):**
1. Identify the new event type or subtype. Likely a SystemEvent with a
   new subtype like `loop_wakeup` or an AttachmentInnerType.
2. Extend the typed union in `server/src/types.ts` and the dashboard
   mirror.
3. New conversation row component rendering the wakeup with a clock
   icon and the cron expression / interval.
4. Test using a real captured line as fixture.

---

### TASK-D2 — `/goal` overlay panel (P1-4) [M-L after capture]

**Capture step:**
```bash
# In a real CC session:
/goal "Implement feature X and all tests pass"
# Let it run a few turns, then exit.
# Locate the JSONL and grep for goal markers:
grep -E '"goal' <that-jsonl> | head -3
```

**Implementation skeleton:**
1. If JSONL emits a goal-set / goal-met event, type it and recognize it
   in the SSE handler.
2. New `GoalOverlay` component in `dashboard/src/components/conversation/`
   pinned to the top-right of `ConversationView` showing:
   - Goal text
   - Elapsed time (live counter)
   - Turn count since `/goal`
   - Token delta since `/goal`
   - Status: in-progress / met / abandoned
3. If JSONL has nothing distinct, fall back to recognizing the user
   message that starts with `/goal ` and tracking until the next user
   message.

---

### TASK-D3 — Full `claude agents` daemon view (P1-1/P1-2) [XL, blocked]

**Blocker:** Daemon state (warm-spare counts, dispatched/Working/Completed,
retire/wake) is not in JSONL. Requires either:
- A CC daemon-side IPC / Unix socket (not currently exposed); or
- The `claude agents --json` CLI flag if it exists in a future CC version.

**Action:** Park this task. Open an issue against `anthropics/claude-code`
requesting a read-only daemon-state API. Until then, the `entrypoint`
badge from P1-1 partial is the maximum representable state.

---

## Execution order

Run tasks in this order to keep tests green at every step:

```
A1 → A2 → A3 → A4 → A5
   → B1 → B2 → B3 → B4 → B5
   → C1 → C2 → C3 → C4
   → D1, D2 (after capture)
```

After each TASK:
1. Run that task's `Verify` block.
2. Run the full suite: `pnpm -C server test && pnpm -C dashboard test`.
3. Run `npx tsc -p server --noEmit && npx tsc -p dashboard --noEmit`.
4. Commit with conventional-commit message referencing the TASK id.

Phase boundaries get a git tag: `phase-a-complete`, `phase-b-complete`,
`phase-c-complete`. The session ends at whatever phase boundary fits the
available time — every TASK is independently mergeable.

## Out of scope (deliberately not in this plan)

- The previously retracted P1-6 context-pressure chart.
- All OC-only items (multi-provider, gRPC, SQLite KG, etc.).
- Visualizing the daemon process state without a daemon API (TASK-D3
  blocker).
