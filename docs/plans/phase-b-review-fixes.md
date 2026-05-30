# Phase B — Review Fixes (bug-fixer brief)

Fix EXACTLY these items from the two adversarial reviews. Strict TDD (failing test first). No feature work, no unrelated refactor. After all fixes: `cd server && npx tsc --noEmit` + `pnpm -C server test` AND `cd dashboard && npx tsc --noEmit` + `pnpm -C dashboard test` must all be green.

## F1 (P1, docs-verified) — AskUserQuestion uses the WRONG PermissionResult variant
`server/src/session/session-manager.ts` `handleQuestion` (~406-452) answers via `{ behavior: "deny", message: answer }`. Per official Anthropic Agent SDK docs (https://platform.claude.com/docs/en/agent-sdk/user-input "Handle clarifying questions"), DENY makes the model perceive its question was REFUSED. The correct answer channel is the **allow** variant with `updatedInput`:
```ts
return { behavior: "allow", updatedInput: { questions: input.questions, answers } };
```
where `answers` maps each question's `question` field → the selected option `label` (string; array of labels for `multiSelect`). `updatedInput?: Record<string, unknown>` exists on `PermissionResultAllow` (verify in installed `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` ~1999).
- **Fix:** change the resolver to settle with `{ behavior: "allow", updatedInput: { questions, answers } }`. Build `answers` from the original `input.questions`: for the single-question case the dashboard surfaces today, `answers = { [questions[0].question]: answer }`. If `input.questions.length > 1` (the UI only collects one answer), answer the first question and `sessionLog.warn` that additional questions aren't surfaced yet — do NOT silently drop and do NOT deny. The **timeout path stays `deny`** (`{ behavior: "deny", message: "Question request timed out" }`) — that's a genuine non-answer.
- Carry whatever the resolver needs (the `questions` array is in scope in `handleQuestion`; keep the `questionResolvers` value signature `(answer: string) => void` and build the map inside the closure).
- Update the `handleQuestion` doc comment (lines ~388-405) which currently claims deny-message is "the supported way" — it's factually wrong.
- **Test:** `session-manager.ask-user-question.test.ts` — assert resolving a question yields `behavior: "allow"` with `updatedInput.answers` keyed by the question text = the answer (not a deny). Keep the timeout→deny test.

## F2 (P1 BLOCKER) — 409 / busy guard misses `waiting-permission`
`server/src/http/routes/session-routes.ts:~650` 409 guard checks only `session.status === "streaming"`. `sendMessage` guard (`session-manager.ts:215`) also only checks `"streaming"`. During a permission prompt or AskUserQuestion the status is `"waiting-permission"`, so a concurrent second POST passes both guards, runs `session.abortController = new AbortController()` (`session-manager.ts:219`), orphaning the first turn's controller and starting a second concurrent `query()`.
- **Fix:** treat any non-terminal active state as busy in BOTH guards: `session.status === "streaming" || session.status === "waiting-permission"`. The route returns 409; `sendMessage` throws the same "already streaming/busy" error (and the route must not register the close→abort handler for the rejected request).
- **Test:** second POST while status `"waiting-permission"` → 409; the first session's `abortController` is unchanged (`signal.aborted === false`).

## F3 (P3-1) — Dead reducer state `streamError` / `isThrottled`
`dashboard/src/lib/streaming-types.ts` (~174,180) + `useStreamingState.ts` (~311,323) write `streamError`/`isThrottled`, but no component reads them (PromptInput surfaces errors via its own local `sseError`/throttle state). Remove the dead fields + their reducer writes (the `error`/`rate_limit`/`api_retry` reducer CASES stay if they do other work; just drop the unread fields). Keep PromptInput's user-facing surfacing intact. Update `useStreamingState.test.ts` accordingly.
- If removing breaks a test that asserts the field, that test was asserting dead state — update it to assert the user-visible behavior instead (or remove if redundant with PromptInput tests).

## F4 (P2-1) — Flaky server test (test-isolation pollution)
`server/src/__tests__/routes-session.test.ts:~261` ("fork returns 500 when sessionManager is missing") intermittently returns 401 instead of 500 under parallel run, because a sibling test leaves a global localhost-token requirement set. Make the test hermetic: reset the global auth/token state in `afterEach` (or build a fresh isolated app per test) so it passes deterministically in the full parallel suite. Do not weaken the assertion.
- **Verify:** run `pnpm -C server test` a few times; the fork test must be stable.

## Optional (only if quick & clearly correct)
- P2-2: in `StreamingTurnArea.tsx`, gate the `finalized`→null on the committed WS turn existing, to avoid a ~200ms blank flash for a uuid-less assistant message. Only if you can do it without regressing the double-render fix.
- P3-2: clear the PromptInput throttle indicator on a subsequent successful event (not only on result), so it isn't a one-way latch.

## Out of scope
P3-3 (lastTurnHadError false-positive product concern), P3-4 (now resolved by F1), P3-6 (array key). Do not touch.
