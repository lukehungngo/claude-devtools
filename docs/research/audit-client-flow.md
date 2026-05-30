# Audit: Client-Side Send-Prompt Flow (PromptInput re-enable)

Date: 2026-05-29
Scope: `dashboard/src/components/conversation/PromptInput.tsx` and its wiring into
`ConversationView` / `SessionPage` / `AppLayout`, the `useStreamingState` reducer,
`StreamingTurnArea`, `slashCommandHandler`, and the server SSE contract
(`server/src/http/routes/session-routes.ts`, `server/src/http/sse-event-handler.ts`).

Context: commit `5047a1f` ("feat: hide prompt conversation feature until ready for
release") removed the `<PromptInput>` render from `ConversationView.tsx:909`
(now just a comment) and `describe.skip`-ed two wiring suites in
`group5-wiring.test.tsx`. This audit hunts bugs/gaps that bite once the prior
render line is restored.

The exact line that was removed (from `git show 5047a1f`):

```tsx
<PromptInput sessionCwd={sessionCwd} sessionId={sessionId} projectHash={projectHash}
  activeSessionId={activeSessionId} onSessionStarted={onSessionStarted}
  getAssistantResponses={getAssistantResponses} metrics={metrics} usage={usage}
  costs={costs} events={events} onOpenPanel={onOpenPanel} hasMessages={turns.length > 0}
  lastTurnHadError={lastTurnHadError} onStreamingEvent={streamingActions.handleSSEEvent}
  onStreamingReset={streamingActions.reset} />
```

Note what this line does NOT pass: `onBashOutput`, `permissionMode` (no such prop),
model/effort/fast state.

---

## P1 — Server `error` / `rate_limit` / `api_retry` SSE events are swallowed; user sees a frozen "Working..." spinner

Evidence:
- Server emits `{ type: "error", message }` in two places:
  - `sse-event-handler.ts:469` — assistant message with `msg.message.error` (rate_limit, billing_error).
  - `session-routes.ts:712` — exception thrown inside the `sendMessage` async iterator.
- Server also emits `rate_limit` (`sse-event-handler.ts:741`), `api_retry` (`:662`),
  `auth_status` (`:653`), and a terminal `done` (`session-routes.ts:707`).
- PromptInput's SSE read loop (`PromptInput.tsx:351-385`) only inspects
  `data.type === "result"` to set `sseError`/`sseStatus`. It forwards every event to
  `onStreamingEvent` (the reducer) but never reacts to `error`/`rate_limit`/`done` itself.
- The reducer `useStreamingState.ts:55-471` has NO case for `error`, `rate_limit`,
  `api_retry`, `auth_status`, `done`, `init`, `tool_summary`, `prompt_suggestion`,
  `command_output` — they all fall to `default: return prev` (`:469-470`).

Root cause: the only terminal signal PromptInput handles is `result`. If the SDK stream
ends with a server-emitted `error` event (and no `result`), the loop exits on stream
`done`, hits `finally` (`:391-395`) which sets `running=false` and schedules
`sseStatus → idle` after 2s — but `sseError` is never set, so no red banner renders.
For a `rate_limit`/`api_retry` mid-stream there is no surfacing at all. `StreamingTurnArea`
keeps its perpetual "Working..." indicator (see next finding) until the next submit.

Impact: a rate-limited or billing-errored send looks like a silent hang. Violates the
project's error-handling rule (never silently swallow errors) and honesty-first.

Proposed fix: in the SSE loop add `if (data.type === "error") { setSseError(data.message); setSseStatus("error"); }`
and handle `rate_limit`/`api_retry` (at minimum surface a banner). Optionally add reducer
cases so the streaming area can clear.

Confidence: high.

---

## P1 — Streaming turn area never clears after `result`; permanent "Working..." spinner + double-rendered response

Evidence:
- On `result`, the reducer sets `sessionState: "idle"` (`useStreamingState.ts:288-296`)
  but does NOT clear `responseText`, `tools`, `toolOrder`, or `thinking`.
- `StreamingTurnArea` renders whenever any of those are non-empty
  (`StreamingTurnArea.tsx:87`) and the "Working..." indicator block
  (`StreamingTurnArea.tsx:144-151`) has NO conditional — it always renders while the area is visible.
- The ONLY caller of `streamingActions.reset()` is `onStreamingReset` inside
  `submitPrompt` (`PromptInput.tsx:270`), fired at the START of the next message.
  Grep confirms `streamingActions` is otherwise unreferenced in
  `ConversationView.tsx` (only the destructure at `:506`).
- Meanwhile the real assistant/user events are broadcast over WebSocket immediately
  (`session-routes.ts:698-703`) and render as a committed `TurnCard`.

Root cause: no reset on stream completion. After a turn finishes, the streaming preview
stays mounted showing the full response with a live "Working..." pulse, AND the same
content appears again as the committed turn — duplicate content until the user sends
the next prompt.

Impact: confusing double render + a spinner that lies about activity. Violates Invariant
#10 (smooth UI/UX, no jank) and data-integrity expectations.

Proposed fix: call `reset()` on `result`/`done` (with a small delay so the compact banner
can show), or gate `StreamingTurnArea` visibility on `sessionState === "running"`, and
make the "Working..." indicator conditional on an active (not-yet-`result`) stream.

Confidence: high.

---

## P1 — `permissionMode` is not threaded to PromptInput; mode chosen in the TopBar badge is lost for the first turn

Evidence:
- `LayoutContext.ts:69-71` exposes `permissionMode` + `setPermissionMode`.
- `AppLayout.tsx:144-164` owns the state; `setPermissionMode` only POSTs to
  `/api/sessions/${targetId}/permission-mode` when `activeSessionId` is truthy
  (`:151-152` — `const targetId = activeSessionId; if (!targetId) return;`).
- `PromptInputProps` (`PromptInput.tsx:15-43`) has NO `permissionMode` prop, and the
  removed render line never passed one.
- `submitPrompt`'s resume (`PromptInput.tsx:281-285`) and new-session
  (`:298-302`) calls send only `{ cwd }`. The message POST (`:317-324`) sends only
  `{ prompt, images }`. None carry permissionMode / model / effort / fast.
- Server `permission-mode`, `fast`, `effort`, `model` endpoints all return 404
  "Session not found" when the session is not yet in `activeSessions`
  (`session-routes.ts:750-754`, `768-770`, `786-788`, `728-731`).

Root cause: permission mode (and model/effort/fast) live in AppLayout/LayoutContext but
never reach PromptInput, and the only sync path requires `activeSessionId`. For a
CLI-discovered session (has `sessionId`, no `activeSessionId`), toggling the mode badge
silently no-ops on the server, and the first send/resume doesn't apply the chosen mode.

Impact: user picks "plan" mode in the badge, sends a prompt, and Claude runs in default
mode anyway for the first turn (no read-only guarantee). Data/behavior integrity gap.

Proposed fix: add `permissionMode` to `PromptInputProps`, pass
`permissionMode={layoutCtx.permissionMode}` on the restored render line, and either
(a) include it in the resume/new body so the SDK starts in the right mode, or
(b) POST `/permission-mode` right after the session is created in `submitPrompt`
(before the message POST). Same pattern needed for model/effort/fast if those badges
exist pre-activation.

Confidence: high (prop absence + conditional POST verified). The exact desired UX
(apply-on-first-send vs apply-immediately) needs product confirmation, hence not P0.

---

## P1 — `!bash` output is orphaned: `onBashOutput` is never wired and `BashOutputBlock` is never rendered

Evidence:
- `submitPrompt` `!`-prefix path POSTs to `/bash` and calls `onBashOutput?.(...)`
  with stdout/stderr/exitCode (`PromptInput.tsx:230-235`).
- The removed render line did NOT pass `onBashOutput`.
- `ConversationViewProps` has no `onBashOutput` field (grep of
  `ConversationView.tsx` returns none).
- `BashOutputBlock` is imported/rendered nowhere except its own file
  (`grep -rln BashOutputBlock` → only `BashOutputBlock.tsx`; tests aside).

Root cause: the consumer chain for bash output was never finished. Even after restoring
the old render line, `!ls`/`!git status` will run server-side and show a 1-line status
toast (`showOutput`, `:238`) but the real stdout/stderr never appears in the conversation.

Impact: `!bash` looks half-broken — command runs, output vanishes. Broken feature erodes
trust (project memory: "fix broken first").

Proposed fix: add `onBashOutput` to `ConversationViewProps`, thread it from SessionPage
into a state array, and render `BashOutputBlock` in the turn stream (or inline near the
input). Pass `onBashOutput` on the restored render line.

Confidence: high.

---

## P2 — Resume failure silently falls through to creating a NEW session (data confusion)

Evidence: `submitPrompt` resume path (`PromptInput.tsx:279-294`): on non-2xx from
`/resume` it falls through (comment at `:290`) to `/sessions/new` (`:296-309`), which
mints a brand-new session UUID and calls `onSessionStarted(newId)`. The user intended to
continue session X; instead they silently start session Y.

Root cause: the fall-through is intentional for "cwd missing / server restart" but there
is no user-facing distinction between "resumed X" and "started fresh Y". `onSessionStarted`
swaps `activeSessionId` to the new id, and the URL/sidebar still points at X.

Impact: confusing session identity; the conversation the user is looking at (X, from
JSONL) diverges from the live session (Y). Medium severity because it only triggers on
resume failure.

Proposed fix: surface a notice ("Could not resume; started a new session") via
`showOutput`, and/or navigate to the new session id so the viewer matches the live stream.

Confidence: medium (behavior verified; severity depends on how often resume fails).

---

## P2 — Abort (Stop / Ctrl+C) does not reset streaming state or clear the spinner

Evidence:
- `handleStop` (`:528-530`) and the global Ctrl+C handler (`:166-174`) call
  `abortRef.current?.abort()`. The fetch rejects with an AbortError, caught and ignored
  in `submitPrompt` catch (`:386-390`), `finally` sets `running=false`.
- `onStreamingReset` is NOT called on abort. The partial `responseText`/tools captured so
  far remain in `streamingState`, so `StreamingTurnArea` keeps rendering the partial
  response with the perpetual "Working..." pulse (same root as the P1 streaming finding).
- Server side, `res.on("close")` aborts the session (`session-routes.ts:650-652`) — good,
  no server leak.

Root cause: abort tears down the fetch but not the client streaming view.

Impact: after Stop, the half-finished response lingers with a live spinner. Compounds the
"never clears" P1.

Proposed fix: call `streamingActions.reset()` (or a lighter "finalize") in `handleStop`
and on AbortError in the catch.

Confidence: high.

---

## P2 — Two skipped wiring suites must be un-skipped; one has a misleading (but currently passing) assertion

Evidence:
- `group5-wiring.test.tsx:132` `describe.skip("GROUP-5: onOpenPanel wiring")` and
  `:180` `describe.skip("GROUP-5: ghost text props wiring")` were skipped by `5047a1f`
  precisely because they query `getByTestId("ghost-suggestion")` / rely on PromptInput
  being rendered.
- These will silently stay green (skipped) after re-enable unless someone removes
  `.skip`. They are the only automated coverage for onOpenPanel + ghost-text wiring.
- The test at `:211-227` is named "lastTurnHadError=true ... shows fix" but asserts
  `"Continue with next steps..."`. That matches reality only because the
  `lastTurnHadError` branch in `computeSuggestion` is commented out
  (`promptSuggestions.ts:21-24`). So `lastTurnHadError` is a DEAD prop: computed via an
  O(n) scan in `ConversationView.tsx:569-587`, passed down, never used.

Root cause: feature was hidden by skipping tests rather than guarding the render; the
ghost-error suggestion was disabled but the prop plumbing + expensive computation remain.

Impact: re-enabling without un-skipping ships untested wiring. The dead `lastTurnHadError`
scan is wasted work on every `events`/`turns` change.

Proposed fix: remove `.skip` from both suites and re-run; either delete the
`lastTurnHadError` prop + its ConversationView computation, or re-enable the branch in
`computeSuggestion` and fix the test name/assertion.

Confidence: high.

---

## P3 — `tool_delta` relies on a single `activeToolRef`; parallel tool_use streaming can misattribute input JSON

Evidence: `useStreamingState.ts:98-121` routes every `tool_delta` to
`activeToolRef.current` (the last `tool_start`). The SDK streams `content_block_delta`
with input_json deltas; the server's `tool_delta` event (`sse-event-handler.ts:424`) drops
the block `index`, so the reducer cannot disambiguate concurrent tool_use blocks. If the
SDK ever interleaves input deltas for two tool_use blocks in one assistant message, the
JSON for the second tool gets appended to the first.

Root cause: `index`/`id` is not carried on `tool_delta`; reducer assumes serial tool input.

Impact: rare today (Anthropic streams one tool_use block at a time per assistant message),
hence P3, but a latent correctness bug for input previews if that changes.

Proposed fix: include the content-block `id`/`index` on the `tool_delta` SSE event and key
the reducer by it instead of `activeToolRef`.

Confidence: low-medium (depends on SDK streaming behavior; flagged as latent).

---

## P3 — `onSessionStarted` / `onOpenPanel` are currently dead ends in ConversationView

Evidence: SessionPage passes `onSessionStarted={setActiveSessionId}` and
`onOpenPanel={handleOpenPanel}` into ConversationView (`SessionPage.tsx:429,438`), but with
PromptInput gone, ConversationView only uses `onSessionStarted` inside `handleClear`
(`ConversationView.tsx:724-740`, bound to Ctrl+L) and `onOpenPanel` for monitor/model
shortcuts (`:760-766`). The slash-command panel-opening and session-start-on-send paths are
dormant until PromptInput returns. Not a bug now, but confirms the callbacks are correctly
plumbed and will light up on re-enable (no missing prop on the SessionPage→ConversationView
edge). The missing edge is ConversationView→PromptInput, which the restored render line
supplies for all except `onBashOutput` (see P1) and `permissionMode` (see P1).

Confidence: high (informational).

---

## Summary of required edits before re-enable

1. Restore the `<PromptInput .../>` render at `ConversationView.tsx:909`, AND additionally
   pass `permissionMode` (new prop) and `onBashOutput` (new prop threaded from SessionPage).
2. Handle `error`/`rate_limit`/`done` in the PromptInput SSE loop and/or reducer (P1).
3. Reset/finalize streaming state on `result`, `done`, and abort (P1, P2).
4. Apply permissionMode (and model/effort/fast) on session create/resume in `submitPrompt`
   or via a follow-up POST (P1).
5. Wire `BashOutputBlock` into the render tree (P1).
6. Un-skip the two `group5-wiring` suites; resolve the dead `lastTurnHadError` prop (P2).

## Validation performed
- `npx tsc --noEmit` on dashboard: exit 0 (current baseline compiles; PromptInput's optional
  props mean the removed render doesn't break types).
- Source-grounded: every claim cites file:line from the working tree and `git show 5047a1f`.
- Not run: vitest suites (the skipped ones are skipped; running them now would not exercise
  the unrendered PromptInput).
