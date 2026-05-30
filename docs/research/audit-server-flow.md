# Audit: Server-side send-prompt flow

Scope: `server/src/session/session-manager.ts`, `server/src/http/routes/session-routes.ts`, `server/src/http/sse-event-handler.ts`, plus the consuming client paths required to prove end-to-end correctness (`dashboard/src/components/conversation/PromptInput.tsx`, `dashboard/src/hooks/useStreamingState.ts`, `dashboard/src/routes/AppLayout.tsx`, `dashboard/src/hooks/useUnifiedWebSocket.ts`).

Method: source-traced. Every claim cites file:line. SDK behavior verified against `@anthropic-ai/claude-agent-sdk@0.3.143` `sdk.d.ts`.

---

## P1 — SSE `res.on("close")` aborts the next message (double-abort race)

**Files:** `server/src/http/routes/session-routes.ts:650-652`, `:671-715`; `server/src/session/session-manager.ts:219`, `:465-473`

The `/sessions/:sessionId/message` handler registers `res.on("close", () => sessionManager.abortSession(sessionId))` once per request (line 650). Node fires the response `'close'` event when the underlying socket closes — which happens **after every `res.end()`**, including the normal success path at line 709 and the error path at line 714, not only on client disconnect.

`abortSession()` (session-manager.ts:465) calls `session.abortController.abort()`, clears `activeQuery`, and forces `status = "idle"` regardless of current state.

Race: `'close'` is emitted asynchronously. If the user sends message B immediately after message A finishes, `sendMessage` for B runs synchronously first — it sets `status = "streaming"` and installs a **fresh** `AbortController` (session-manager.ts:218-219). If A's deferred `'close'` callback then fires, it aborts B's brand-new controller and resets B's status to `idle`, killing B's in-flight stream. There is no per-request guard (e.g. capturing the controller at request start, or a `finished`/`request-scoped` flag) to ensure the close handler only aborts the stream it belongs to.

**Confidence:** medium (race window is real and unguarded; reproduction depends on event-loop timing of `'close'` vs. the next request). Even outside the race, the handler does redundant abort/idle churn on every successful turn.

**Proposed fix:** Capture the request's own `AbortController` (or a request-local `closed` flag) at the top of the handler. In the `close` listener, only abort if the stream did not complete normally — e.g. set `let finished = false;` before the loop, `finished = true` after `res.end()`, and `if (!finished) sessionManager.abortSession(sessionId)`. Alternatively, have `sendMessage` return its controller and abort that exact instance rather than calling `abortSession(sessionId)` which targets whatever controller is currently on the session.

---

## P1 — AskUserQuestion flow is dead end-to-end (questionResolvers never populated, `user-question` never broadcast)

**Files:** `server/src/session/session-manager.ts:126`, `:198`, `:420-434`, `:646-654`; `server/src/http/routes/session-routes.ts:541-576`; `server/src/types.ts:810-822`; `dashboard/src/routes/AppLayout.tsx:176-198`; `dashboard/src/hooks/useUnifiedWebSocket.ts:100-101`

The client is fully wired for an interactive agent-question flow:
- `useUnifiedWebSocket.ts:100` listens for WS `type: "user-question"` and calls `onUserQuestion`.
- `AppLayout.tsx:176` pushes the question into state; `submitAnswer` (`:191`) POSTs to `/api/questions/:questionId/answer`.

The server side is a stub:
- `ActiveSession.questionResolvers` (session-manager.ts:126) is **never populated** anywhere in `server/src`. `grep "questionResolvers.set"` across `server/src` returns only test files (`__tests__/session-manager.test.ts`), never production code. The `canUseTool` callback (session-manager.ts:266-277) is the only SDK callback bridged, and it routes to `handlePermission`, not to any question resolver.
- The server **never broadcasts** a `user-question` WS message. `grep "user-question"` in `server/src` matches only the type declaration in `types.ts:811`. So `onUserQuestion` on the client never fires.
- Consequently `getPendingQuestions()` (session-manager.ts:646) always returns `[]`, and `resolveQuestion()` (session-manager.ts:420) always returns `false`, so `POST /questions/:questionId/answer` (session-routes.ts:560-563) always responds **404 "Question not found"**.

Net effect: the AskUserQuestion UI never appears, and if it ever did, the answer endpoint could not resolve it. This violates the project's "Done means E2E verified" rule — the feature exists in code but is non-functional.

**Confidence:** high.

**Proposed fix:** Either (a) implement the flow: detect AskUserQuestion tool calls in the SDK stream (or via `canUseTool`), register a resolver in `questionResolvers`, broadcast `user-question`, and have the answer feed back into the SDK; or (b) if AskUserQuestion is intentionally deferred, remove the dead client wiring (`onUserQuestion`, `submitAnswer`, the `/questions/*` routes, `questionResolvers`, `getPendingQuestions`) so the surface honestly reflects capability. Per `fe-guide.md` rule 8 ("names match capability") and honesty-first, do not ship a visible-but-broken path.

---

## P1 — Terminal SSE `error` event is never surfaced to the user (silent failure)

**Files:** `server/src/http/routes/session-routes.ts:710-715`; `server/src/http/sse-event-handler.ts:467-471`; `dashboard/src/components/conversation/PromptInput.tsx:351-384`; `dashboard/src/hooks/useStreamingState.ts:53-471`

When `sendMessage` throws, the route emits `data: {type:"error", message}` then `res.end()` (session-routes.ts:711-714). The mapper can also emit a mid-stream `{type:"error", message}` for assistant-level errors (sse-event-handler.ts:468-470).

On the client:
- PromptInput's read loop forwards every parsed event to `onStreamingEvent` (PromptInput.tsx:359), but only sets the visible error (`setSseError`/`setSseStatus("error")`) inside the `data.type === "result"` branch (PromptInput.tsx:360-376). A `type:"error"` event matches no branch — it is dropped. The `catch` at PromptInput.tsx:386-390 only fires on a thrown JS exception in the loop, not on a successfully parsed `error` SSE frame, and after a clean `res.end()` the loop simply exits at `done` (line 345).
- `useStreamingState.handleSSEEvent` has no `case "error"` — it hits `default: return prev` (useStreamingState.ts:469-470).

So a server-side stream error (SDK throw, auth failure, etc.) ends the stream with no user-visible message; the input silently resets to idle after 2s (PromptInput.tsx:394). This breaks Architecture Invariant #9 (data integrity / "wrong or no feedback is worse than no data") and the coding-style rule "never silently swallow errors."

**Confidence:** high.

**Proposed fix:** In PromptInput's loop add `if (data.type === "error") { setSseError(data.message ?? "Stream error"); setSseStatus("error"); }`. Optionally also add a `case "error"` in `useStreamingState` for parity.

---

## P2 — Several emitted SSE event types have no client handler (silent no-ops)

**Files:** `server/src/http/sse-event-handler.ts` (emitters); `dashboard/src/hooks/useStreamingState.ts:53-471` (consumer)

The server's mapper emits `init` (sse-event-handler.ts:557-563), `rate_limit` (:740-746), `auth_status` (:653-659), `api_retry` (:662-670), `command_output` (:757-764), `prompt_suggestion` (:749-754), and `tool_summary` (:730-737). `useStreamingState.handleSSEEvent` has cases only for `stdout, thinking, tool_start, tool_delta, tool_end, tool_result, tool_progress, status, compact, session_state_changed, permission_denied, result, task_*, hook_*` (useStreamingState.ts:56-467). The rest fall through to `default: return prev` (line 469).

`rate_limit` and `api_retry` are user-relevant (the user has no indication the request is being throttled/retried); `tool_summary` and `prompt_suggestion` are feature gaps. These are not crashes, but they are emitted-but-unconsumed contracts: dead bandwidth and missing UX. Some of these may be consumed elsewhere (e.g. via the WS new-events broadcast for `assistant`/`user`), but the SSE variants here are not.

**Confidence:** high that the events are unhandled in `useStreamingState`; medium on user impact (depends on whether the dashboard surfaces rate-limit/retry through another channel — none found in this trace).

**Proposed fix:** Add handlers for at least `rate_limit` and `api_retry` (show a throttle/retry banner). Audit `init`/`command_output`/`tool_summary`/`prompt_suggestion` for intended consumers; drop emission or wire the UI.

---

## P2 — `POST /sessions/:sessionId/message` does not reject when session is already streaming (returns mid-stream error instead of 409)

**Files:** `server/src/http/routes/session-routes.ts:626-716`; `server/src/session/session-manager.ts:215`

`sendMessage` throws `"Session ${id} is already streaming"` synchronously when `status === "streaming"` (session-manager.ts:215). But the route has already sent SSE headers and `flushHeaders()` (session-routes.ts:644-648) before entering the `for await` (line 671). The throw is caught at line 710 and serialized as a `{type:"error"}` SSE frame — which, per the P1 finding above, the client never surfaces. There is also no pre-check before `flushHeaders()`. A concurrent double-submit therefore appears to do nothing on the client.

Additionally, the `res.on("close")` from the rejected second request will run `abortSession(sessionId)` (line 650-651), which **aborts the first, legitimately-streaming session** — compounding the P1 race.

**Confidence:** medium.

**Proposed fix:** Check `session.status === "streaming"` before `flushHeaders()` and return `409` JSON. Do not register the close→abort handler for a request that did not own the stream.

---

## P2 — Image input is unvalidated at the API boundary (size, count, mediaType, base64 shape)

**Files:** `server/src/http/routes/session-routes.ts:626-669`; `server/src/session/session-manager.ts:208-244`

`POST /message` accepts `images` from the body and maps them with no validation (session-routes.ts:656-668): no cap on array length, no per-image byte cap, no allowlist on `mediaType` beyond the regex only when `dataUrl` is present (a raw `data` + arbitrary `mediaType` string passes through untouched at line 658-659), and no check that `data` is valid base64. The values are forwarded directly into the SDK content blocks (session-manager.ts:233-242). Per `language-stack.md` ("All API boundaries must validate input using Zod") and `coding-style.md` ("never trust external data"), this is a boundary-validation gap. Risk is memory/abuse (a large base64 payload is held in the Express body and forwarded) and malformed content reaching the SDK.

**Confidence:** medium (no confirmed crash; clear missing validation).

**Proposed fix:** Validate `images` with a schema: cap count (e.g. ≤20), cap decoded size, restrict `mediaType` to `image/(png|jpeg|gif|webp)`, and validate base64. Reject with 400 on violation.

---

## P3 — `/sessions/:sessionId/bash` runs arbitrary shell in cwd; CSRF check is bypassable when Origin/Referer absent

**Files:** `server/src/http/routes/session-routes.ts:990-1026`

The bash route shells out via `spawnAsync("bash", ["-c", command], { cwd: session.cwd })` (line 1013). The only guard is an Origin/Referer localhost check (line 993-996) that is **skipped entirely when both headers are empty** (`if (origin && ...)` — empty origin passes). Non-browser clients (curl, other local processes) send no Origin and execute arbitrary commands in the session's working directory. This is documented as an intentional "! bash mode," and the server binds locally, so impact is bounded to localhost — hence P3 — but the validation is weaker than it appears. There is no command allowlist and no auth token.

**Confidence:** high on the bypass; low on exploitability (local-only daemon).

**Proposed fix:** Require a same-origin token or reject when Origin is absent for state-changing routes; or gate the bash route behind an explicit opt-in env flag. At minimum, document that this route is a local-trust boundary.

---

## P3 — `summarizeUpTo` fire-and-forget drain can leave session stuck if the dispatch throws after response sent

**Files:** `server/src/http/routes/session-routes.ts:823-861`; `server/src/session/session-manager.ts:559-584`

`summarizeUpTo` returns a stream that the route drains in a detached async IIFE (session-routes.ts:843-852) after already sending `res.json({ ok: true })` (line 853). `sendMessage` set `status = "streaming"` (session-manager.ts:218); if the SDK stream errors, `sendMessage`'s catch sets `status = "error"` (session-manager.ts:309) and the detached drain swallows it (session-routes.ts:848-851 `void err`). The HTTP caller already got `ok:true`, so the dashboard believes the compact succeeded while the session is wedged in `error` until GC or the next message. No SSE channel exists for this path to report failure.

**Confidence:** medium.

**Proposed fix:** Either stream the compact result over SSE (like `/message`) so the client sees success/failure, or have the drain reset session status and broadcast a `status`/`error` WS message on failure.

---

## Positive / non-issues verified

- **Permission promise leak/timeout:** `handlePermission` (session-manager.ts:358-376) correctly installs a 10-min timeout, deletes the resolver in both the timeout and resolve paths, and clears the timer on resolve. No leak. `RESOLVER_TIMEOUT_MS = 10 * 60 * 1000` (session-manager.ts:146) matches the documented contract.
- **Session-allowance auto-approve:** `handlePermission` short-circuits via `isToolAllowedForSession` (session-manager.ts:327-330) before broadcasting — correct.
- **resolvePermissionRequest return shape:** route uses `result.sessionId`/`result.toolName` (session-routes.ts:508) and `resolvePermissionRequest` returns the full `PermissionRequest` (permission-handler.ts:66-78) — shape matches.
- **new-session vs resume id handling:** correct. New sessions pass `{ sessionId }`, resumed pass `{ resume: sessionId }` (session-manager.ts:253-255), and `isNew` flips to false after the first successful turn (session-manager.ts:301) so subsequent turns resume. `resumeSession` sets `isNew: false` (session-manager.ts:458).
- **Permission-mode validation:** route validates against `VALID_PERMISSION_MODES` via `isValidPermissionMode` (session-routes.ts:742, session-manager.ts:399). Effort-level route validates against the same set as the type (session-routes.ts:777). Good boundary validation here.
- **File-descriptor leaks:** the message route uses the SDK iterator (no raw fds); `git-diff`/`open-file` use `spawnSync` with timeouts; `countUserTurnUpTo` uses async `readFile` (no fd held). No leak found in this flow.
- **File-suggest path traversal:** `/files` resolves and confines `targetDir` within cwd (session-routes.ts:359-366) — correct.

---

## Summary of fixes by priority

1. **P1** — Guard `res.on("close")` so it only aborts on real disconnect, not after normal `res.end()`; capture the request's own controller. (session-routes.ts:650)
2. **P1** — Implement or remove the AskUserQuestion flow; it is currently dead end-to-end. (session-manager.ts questionResolvers; missing `user-question` broadcast)
3. **P1** — Surface `type:"error"` SSE frames in the client. (PromptInput.tsx:360)
4. **P2** — Add client handlers (or stop emitting) `rate_limit`/`api_retry`/`init`/etc. (useStreamingState.ts default)
5. **P2** — Reject double-submit with 409 before flushing SSE headers. (session-routes.ts:644)
6. **P2** — Validate `images` at the boundary with a schema. (session-routes.ts:656)
7. **P3** — Tighten bash-route CSRF (reject empty Origin) / gate behind opt-in. (session-routes.ts:993)
8. **P3** — Report `summarizeUpTo` drain failures to the client. (session-routes.ts:843)
