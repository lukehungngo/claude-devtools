# Phase B — CLIENT track (engineer brief)

**You own `dashboard/src/**` ONLY.** Do NOT edit any `server/` files. Full context: `docs/research/audit-client-flow.md`, `docs/plans/sdk-upgrade-impl-plan.md`.

Method: **strict TDD** (RED → verify fail → GREEN → verify pass → refactor). Every fix gets a failing test first. Cite the audit finding in test names.

FE rules (`.claude/rules/fe-guide.md`): TypeScript strict, no `any`; Tailwind `dt-*` tokens only, no static `style={{}}` (inline only for dynamic values); named exports; `lucide-react` icons only; `react-markdown`+`remark-gfm` for markdown; explicit prop types via `interface`. Match existing typography/spacing/color — visual consistency is a hard gate.

## SSE contract (server already emits these — do NOT change server; just consume)
- `{ type: "error", message: string }` — terminal or mid-stream error (rate_limit/billing/SDK throw).
- `{ type: "rate_limit", ... }` and `{ type: "api_retry", ... }` — throttle/retry signals.
- `{ type: "result", ... }` — terminal success. `{ type: "done" }` — stream end.
- `{ type: "user-question" ... }` over WS is already handled in AppLayout — do NOT touch.

## Tasks (in order)

### C1 (P1) — Surface `error`/`rate_limit`/`api_retry` SSE frames (no more silent frozen spinner)
`PromptInput.tsx` SSE read loop (~:351-385) only reacts to `data.type==="result"`. A `{type:"error"}` frame is forwarded to the reducer but never sets the visible error.
- **Fix:** in the loop, on `data.type==="error"` → `setSseError(data.message ?? "Stream error")` + `setSseStatus("error")`. Surface `rate_limit`/`api_retry` as a non-fatal banner/status (at minimum a visible indicator). Add matching `case "error"` (and optional `rate_limit`/`api_retry`) to `useStreamingState.ts` for parity if the streaming area should reflect it.
- **Test:** feeding an `error` SSE frame sets the error UI; a `rate_limit` frame surfaces a throttle indicator.

### C2 (P1) — Reset/finalize streaming state on `result`, `done`, and abort
On `result` the reducer sets `sessionState:"idle"` but never clears `responseText`/`tools`/`thinking` → `StreamingTurnArea` keeps a perpetual "Working..." pulse AND duplicates the committed turn. Only caller of `reset()` is the START of the next submit.
- **Fix:** finalize the streaming preview when the turn ends. Options (pick the cleanest, keep 60fps): call `streamingActions.reset()` (small delay so a compact banner can show) on `result`/`done`; gate `StreamingTurnArea` visibility on `sessionState==="running"`; make the "Working..." indicator (`StreamingTurnArea.tsx:144-151`) conditional on an active (not-yet-`result`) stream. Also call reset/finalize in `handleStop` and on AbortError (`PromptInput.tsx` ~:528-530, ~:166-174, catch ~:386-390) so Stop clears the spinner. Avoid double-rendering the response that the WS-committed TurnCard already shows.
- **Test:** after a `result`, the streaming "Working..." indicator is gone and the preview is cleared/finalized (no duplicate); after abort, the spinner clears.

### C3 (P1) — Thread `permissionMode` to PromptInput and apply it on first send
`PromptInputProps` has no `permissionMode`; the badge mode chosen in TopBar is lost for the first turn (the `/permission-mode` POST 404s pre-activation).
- **Fix:** add `permissionMode?: PermissionMode` to `PromptInputProps`; consume from props. After a session is created/resumed in `submitPrompt` (and before/with the first message), apply the chosen mode — either include it in the new/resume body OR POST `/api/sessions/:id/permission-mode` immediately after creation (before the message POST). Read `permissionMode` from `LayoutContext` in `ConversationView` and pass it on the restored render (see C6).
- **Test:** with `permissionMode="plan"`, starting a session applies plan mode on the first turn (assert the POST/body carries the mode).

### C4 (P1) — Wire `!bash` output into the conversation (currently orphaned)
`submitPrompt` `!`-path POSTs `/bash` and calls `onBashOutput?.(...)`, but the removed render never passed `onBashOutput`, `ConversationViewProps` has no such field, and `BashOutputBlock` renders nowhere.
- **Fix:** add `onBashOutput` to `ConversationViewProps`, thread from `SessionPage` into a state array, render `BashOutputBlock` in the turn stream (or inline near the composer). Pass `onBashOutput` on the restored render.
- **Test:** a `!ls` whose `/bash` resolves renders a `BashOutputBlock` with stdout/exit code.

### C5 (P2) — Un-skip wiring suites + resolve dead `lastTurnHadError`
`group5-wiring.test.tsx` has 2 `describe.skip` (onOpenPanel wiring, ghost text props wiring) from commit 5047a1f. `lastTurnHadError` is computed (O(n) scan, `ConversationView.tsx:569-587`) and passed but unused because the branch in `promptSuggestions.ts:21-24` is commented out.
- **Fix:** remove `.skip` from both suites. Resolve the dead prop by **re-enabling** the `lastTurnHadError` ghost-text branch in `promptSuggestions.ts` (restore the intended "last turn errored" suggestion) so the prop is live; update the test at `group5-wiring.test.tsx:211-227` (name + assertion) to match the restored behavior. (Keep the O(n) scan only if the branch uses it; if it can be derived more cheaply, prefer that — but don't ship a dead prop.)
- **Test:** the un-skipped suites pass; ghost text shows the error-fix suggestion when `lastTurnHadError`.

### C6 (P1) — Restore the `<PromptInput>` render
At `ConversationView.tsx:909` (`{/* Command input — hidden until ready to release */}`), restore the render that commit 5047a1f removed, PLUS the two new props from C3/C4:
```tsx
{/* Command input */}
<PromptInput sessionCwd={sessionCwd} sessionId={sessionId} projectHash={projectHash}
  activeSessionId={activeSessionId} onSessionStarted={onSessionStarted}
  getAssistantResponses={getAssistantResponses} metrics={metrics} usage={usage}
  costs={costs} events={events} onOpenPanel={onOpenPanel} hasMessages={turns.length > 0}
  lastTurnHadError={lastTurnHadError} onStreamingEvent={streamingActions.handleSSEEvent}
  onStreamingReset={streamingActions.reset}
  permissionMode={/* from LayoutContext */}
  onBashOutput={/* threaded */} />
```
Verify all referenced identifiers exist in current ConversationView (they do: `usage`, `costs`, `getAssistantResponses`, `lastTurnHadError`, `streamingActions`). Read `usage`/`costs` from `LayoutContext` if not already in scope.

## Gate before returning
- `cd dashboard && npx tsc --noEmit` → exit 0
- `pnpm -C dashboard test` → all green (run ONLY dashboard tests; do not run server tests)
- `pnpm -C dashboard lint:styles` if present.
- Report: per-task RED→GREEN evidence, files changed with line refs, and confirm the composer renders + visual tokens match existing components.
