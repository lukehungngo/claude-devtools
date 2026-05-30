# Phase B — SERVER track (engineer brief)

**You own `server/src/**` ONLY.** Do NOT edit any `dashboard/` files. Full context: `docs/research/audit-server-flow.md`, `docs/plans/sdk-upgrade-impl-plan.md`.

Method: **strict TDD** (RED → verify fail → GREEN → verify pass → refactor). Every fix gets a failing test first. Cite the audit finding in test names/comments.

Project rules: pino logger (never `console.log`), `spawnSync` not `execSync`, immutable updates, no `any` without `// justification:`, validate API boundaries with Zod, explicit return types on exported fns, errors handled explicitly.

## Tasks (in order)

### S1 (P1) — Double-abort race: `res.on("close")` aborts the next message
`server/src/http/routes/session-routes.ts` `/sessions/:sessionId/message` registers `res.on("close", () => sessionManager.abortSession(sessionId))` (~:650). Node fires `'close'` after EVERY `res.end()` (success path ~:709, error ~:714), not only on client disconnect. A deferred `'close'` from message A can abort message B's fresh AbortController.
- **Fix:** request-local `let finished = false;` set `true` immediately after the stream completes normally (after the `for await` loop / before/at `res.end()` success path). In the close listener: `if (!finished) sessionManager.abortSession(sessionId);`. Keep aborting on genuine disconnect.
- **Test:** simulate normal completion then assert `abortSession` is NOT called on the post-`end()` close; assert it IS called when close fires before completion.

### S2 (P2) — Reject double-submit with 409 before flushing SSE headers
`sendMessage` throws "already streaming" when `status==="streaming"` (`session-manager.ts:215`), but the route has already `flushHeaders()` so the throw becomes a swallowed `{type:"error"}` SSE frame; and the rejected request's `close` handler aborts the FIRST live stream.
- **Fix:** in the message route, BEFORE `flushHeaders()`, check the session is already streaming (add a `SessionManager.isStreaming(sessionId): boolean` or reuse status) and return `409` JSON `{ error: "Session is already streaming" }`. Do NOT register the close→abort handler for a request that did not own the stream.
- **Test:** second concurrent POST while streaming → 409, and the first stream's controller is untouched.

### S3 (P1) — AskUserQuestion dead end-to-end (implement the server bridge)
Client is fully wired (`AppLayout`, `useUnifiedWebSocket` listens for WS `type:"user-question"`, POST `/api/questions/:questionId/answer`). Server is a stub: `ActiveSession.questionResolvers` (`session-manager.ts:126`) is never populated, no `user-question` WS broadcast, so `resolveQuestion` always returns false → answer endpoint 404s.
- **Fix:** Detect AskUserQuestion tool calls in the SDK stream / via `canUseTool` and bridge them:
  1. When an AskUserQuestion tool-use is seen, register a resolver in `questionResolvers` keyed by a question id, and broadcast a `user-question` WS message (shape per `server/src/types.ts:810-822` — `{ id, questionText }` matching `useUnifiedWebSocket.ts:100-101` and `AppLayout.tsx:176`).
  2. `getPendingQuestions()` returns registered questions; `resolveQuestion(id, answer)` resolves the promise and feeds the answer back into the SDK (the canUseTool result / tool result), returning true.
  3. The answer must flow back so the agent continues. Inspect the SDK `canUseTool` AskUserQuestion shape in installed `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` to wire the response correctly (ground-truth, no guessing).
- **IMPORTANT:** If, after reading the SDK types, a clean end-to-end implementation is genuinely not possible with the current SDK surface (e.g. AskUserQuestion is not exposed via canUseTool and not detectable in the stream), STOP and report exactly why with file:line evidence — do NOT fake it. (Decision D3 prefers implement over remove, but honesty over a broken path.)
- **Test:** a simulated AskUserQuestion tool-use registers a pending question + broadcasts `user-question`; `resolveQuestion(id, answer)` resolves and the answer endpoint returns 200; `getPendingQuestions()` reflects state.

## Gate before returning
- `cd server && npx tsc --noEmit` → exit 0
- `pnpm -C server test` → all green (run ONLY server tests; do not run dashboard tests)
- Report: per-task RED→GREEN evidence, files changed with line refs, any blockers (esp. S3), and the exact new/changed SSE/WS event shapes so the client track stays in contract.
