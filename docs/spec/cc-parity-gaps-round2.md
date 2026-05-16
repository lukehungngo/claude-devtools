# CC Parity — Round 2 Gap Status (post phase-c-complete)

**Anchor:** `master` @ `45516c3` (tag `phase-c-complete`)
**Date:** 2026-05-16
**Predecessor:** `docs/spec/cc-parity-gaps.md`, `docs/plans/cc-parity-implementation-plan.md`

This is a verified scan after the 14-task implementation loop. Each gap below has been **grep-confirmed against the current code or filesystem** with the evidence quoted.

---

## A. Verified closed (no follow-up needed)

| ID | Spec | Evidence |
|---|---|---|
| P0-1..P0-5 | enum widening, hook event types, attachment model | shipped pre-loop |
| LX-1 cacheReadTokens | `dashboard/src/lib/turnSnapshot.ts` defines field; `npx tsc -p dashboard` exits 0 |
| LX-2 TurnCard test | `pnpm vitest run TurnCard.test.tsx` 19/19; SettingsPanel 12/12 |
| LX-3 DebugDB env | `pnpm -C server test` shows 31 skipped, 0 failed |
| LX-4 task-notification | `HooksTab.tsx:30 type HookSource = "hook" \| "Monitor"`, line 66 routes commandMode==="task-notification" |
| B1 P2-4 terminalSequence | `HooksTab.tsx:2 import { Bell }`; line 357 renders icon when field present |
| B3 P2-6 purge action | `server/src/http/routes/project-routes.ts:54,88`, `dashboard/.../PurgeConfirmModal.tsx`, mounted at `routes.ts:27` |
| B4 P2-9 PreCompact attr | `StreamingTurnArea.tsx:26 result.attributedTo?.cancelled` block; ring-buffer in `sse-event-handler.ts` |
| B5 P2-10 Usage tab | `discovery-routes.ts:121 /usage/breakdown`; `UsageTab.tsx:25 fetch("/api/usage/breakdown")` |
| C1 FU-1 summarize-bound | `session-manager.ts:482 summarizeUpTo`, line 498 dispatches `/compact Summarize ... user turn ${turnNumber}` |
| C2 FU-2 entrypoint last-seen | `session-cache.ts:159 tailEntrypoint`; overrides head value when present |
| C3 FU-3 hook↔tool correlation | `LayoutContext.ts:89 highlightedToolUseId`, `:93 highlightedHookId`; HooksTab reads at line 168 |
| C4 FU-4 static compact markers | `ConversationView.tsx:19 StaticCompactMarker import`; `compactEvents.ts:extractCompactMarkers` |

---

## B. Verified open — actionable now

### NEW-1 — `~/.claude/sessions/<pid>.json` daemon state never read (UNBLOCKS P1-1/P1-2)

**Evidence (filesystem):**
```bash
ls ~/.claude/sessions/*.json | wc -l         # → 10 files on this machine
python3 ... # → {pid, sessionId, cwd, startedAt, updatedAt, version, peerProtocol,
              #   kind, entrypoint, status, bridgeSessionId}
```

Sample:
```json
{
  "pid": 6959,
  "sessionId": "23ba0306-1ae7-4890-b6bc-08c5c49ace13",
  "cwd": "/Users/soh/working/ai/claude-devtools",
  "startedAt": 1778908821327,
  "updatedAt": 1778920130577,
  "version": "2.1.142",
  "kind": "interactive",
  "entrypoint": "cli",
  "status": "busy",
  "bridgeSessionId": "session_016ERz69Kc3NHTg9uGeB7wzU"
}
```

**Schema observed (10 samples):**
- `status`: `"idle"` | `"busy"` (no `"streaming"`/`"waiting-permission"` seen yet but expected)
- `kind`: `"interactive"` only so far — background sessions would write `"background"` (presumed; awaits a `claude --bg` capture)
- `entrypoint`: `"cli"`, `"claude-desktop"` observed
- `bridgeSessionId`: present when Remote Control / claude.ai bridge is connected

**Evidence (devtools does NOT read):**
```bash
grep -rn "/Users/soh/.claude/sessions\|claude/sessions/\|sessionsDir" server/src dashboard/src | grep -v test
# → empty
```

**Impact:** Closes the "P1-1/P1-2 daemon view blocked, no API" claim from `cc-parity-gaps.md`. This IS the API — a stable on-disk sidecar.

**Acceptance criteria for the next loop:**
- New `server/src/parser/daemon-session-discovery.ts` reading `~/.claude/sessions/*.json`, with stat-based cache invariant #2 compliance.
- New `GET /api/daemon-sessions` returning the list with PID, status, bridgeSessionId.
- Cross-reference into SessionInfo: add `daemonStatus?: "idle" | "busy" | "background"` and `pid?: number` and `bridgeSessionId?: string`.
- Dashboard: replace the mtime-based "isRunning" heuristic in RepoList with the daemon `status` when available. Show a green dot for `busy` and a pulsing one when `bridgeSessionId` is set ("connected via Remote Control").

---

### NEW-2 — `~/.claude/tasks/<sessionId>/<n>.json` daemon task store never read

**Evidence (filesystem):**
```bash
ls ~/.claude/tasks/ | wc -l                  # → 29 task dirs
cat ~/.claude/tasks/906e118c-.../10.json     # →
  { "id": "10", "subject": "...", "description": "...",
    "activeForm": "...", "status": "completed",
    "blocks": [], "blockedBy": [] }
```

**Evidence (current Tasks tab is JSONL-derived):**
```bash
grep -rn "deriveSessionTasks" dashboard/src   # → uses tool_use TaskCreate/TaskUpdate events
```

So devtools re-derives task state from the JSONL event stream, while the authoritative blocks/blockedBy graph + final status sits at `~/.claude/tasks/<sid>/<id>.json` and is more correct (events can be out-of-order; the daemon files reflect post-merge state).

**Acceptance criteria:**
- New `loadDaemonTaskState(sessionId)` reading the dir.
- `TasksTab.tsx` prefers daemon state when available, falls back to `deriveSessionTasks` for older sessions without a tasks dir.
- Render `blockedBy` arrows or a small chain badge so users see dependency wait state.

---

### B2/P2-5 — production wiring missing (subagent flagged in report)

**Evidence (server side plumbed):**
```bash
grep stopReason dashboard/src/components/bottom-panel/CostTab.tsx
# → 11 stopReason; 16 finishReasons; 67 takes prop; 120 renders <OtelResultRow>
```

**Evidence (BottomPanel doesn't pass it):**
```ts
// dashboard/src/components/bottom-panel/BottomPanel.tsx:299
<CostTab metrics={metrics} />
```

**Acceptance criteria (small):**
- Wire `state.lastResultStopReason` and `state.lastResultFinishReasons` from `useStreamingState` through `BottomPanel` props (or via `LayoutContext` since C3 already added one).
- Pass to `<CostTab>`.
- Add a smoke test: render BottomPanel with state containing the fields → CostTab renders the labels.

---

## C. Verified open — pre-existing lint debt (newly visible)

### LX-5 — `react-hooks/rules-of-hooks` error in ToolEntries.tsx

**Evidence:**
```bash
npx eslint dashboard/src/components/conversation/ToolEntries.tsx
# →
# 441:39 error  React Hook "useState" is called conditionally  react-hooks/rules-of-hooks
# 3:56  warning 'ContentItem' is defined but never used
```

Pre-existing on master; C3 noted it but did not fix it. Real bug — conditional hook calls violate React's rules and can cause hooks state desync.

**Fix:** Hoist the `useState` above the early return at line ~440. Trivial.

### LX-6 — 4 `require-yield` errors in session-manager.test.ts

**Evidence:**
```bash
npx eslint server/src/session/session-manager.test.ts
# → 264:5, 298:5, 367:5, 426:5  error  This generator function does not have 'yield'  require-yield
```

These are test stubs (`async function*` with no yield, intentionally returning end-of-stream immediately). Either add a no-op `if (false) yield;` or change to `async function` + manual `[Symbol.asyncIterator]`. Trivial.

---

## D. Verified open — capture-gated (Phase D unchanged)

### P1-3 `/loop` & `CronCreate` markers — still no sampled session

```bash
find ~/.claude/projects -name "*.jsonl" | xargs grep -l '"loop_wakeup"\|"scheduled_fire"' 2>/dev/null | wc -l
# → 0
```

`~/.claude/scheduled-tasks/` contains only `SKILL.md` files (skill definitions, not scheduled-task state) — so the marker format remains unverified.

### P1-4 `/goal` overlay — still no sampled session

```bash
find ~/.claude/projects -name "*.jsonl" | xargs grep -l '"goal_set"\|"goalEvaluator"' 2>/dev/null | wc -l
# → 0
```

---

## E. Verified open — partial design choices to revisit

### FU-1 limitation — bound-by-prompt-template, not API

Confirmed: `session-manager.ts:498` dispatches `/compact Summarize the conversation up to and including user turn N. Preserve verbatim every turn after that point.` This is a prompt hint; CC's SDK has no compact-up-to-uuid API. Listed as a limitation, not a gap to close until SDK exposes one.

### LX-4 design — chose unified Hooks tab over separate "Notifications" tab

Confirmed: `HooksTab.tsx:30 type HookSource = "hook" | "Monitor"` — single tab, source column. Worth re-evaluating once `task-notification` volume is observed in real use; can split later without data-model changes.

---

## F. Tests / types status

```
server   679 pass / 31 skip / 0 fail   (tsc clean)
dashboard 1484 pass / 4 skip / 0 fail   (tsc clean)
total                +50 new tests across the 14-task loop
```

---

## Next-loop priority (recommended order)

1. **NEW-1** (XL, high impact) — daemon-state ingestion. Single biggest unlock; replaces every mtime heuristic with authoritative status.
2. **NEW-2** (M, complements NEW-1) — daemon task-state ingestion for the Tasks tab.
3. **B2-WIRE** (S) — pass `stopReason`/`finishReasons` through BottomPanel to CostTab. Already-shipped data, one prop drill.
4. **LX-5** (S) — fix the `rules-of-hooks` error in `ToolEntries.tsx`. Real bug.
5. **LX-6** (S) — fix `require-yield` test-stub errors.
6. **D capture** — separately, run `/loop 30s ...` and `/goal "..."` in a sandbox CC session to unblock P1-3 and P1-4.

NEW-1 + NEW-2 + B2-WIRE all touch independent files and can be parallelized across three subagents.
