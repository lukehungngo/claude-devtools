# Brainstorm: "No conversation found" when messaging a CLI-started session

**Date:** 2026-04-19
**Input type:** Problem
**Input:** API returns `{"type":"result","is_error":true,"errors":["No conversation found with session ID: 5bd34918..."]}` when posting to `/api/sessions/{id}/message`

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Session `5bd34918` exists on disk as JSONL | CONFIRMED | Active session visible in dashboard session list |
| Dashboard can observe any JSONL session | CONFIRMED | Session page loads and shows all turns |
| Dashboard can send messages to any session it can read | QUESTIONED | Error proves otherwise — observation ≠ control |
| SDK tracks sessions it didn't start | CONFIRMED FALSE | `activeSessions.get(sessionId)` returns `undefined` for CLI sessions |

## Fundamentals

Two distinct session origins exist:

| Origin | activeSessions map | Can send messages |
|--------|--------------------|-------------------|
| Dashboard-started (SDK `query()`) | ✅ present | ✅ yes |
| CLI-started (JSONL on disk) | ❌ absent | ❌ no — no SDK handle |

Bedrock constraint: a running `claude` CLI process owns the live SDK connection. There is no IPC channel from the dashboard into a running CLI process.

The actual bug: the dashboard shows the message input on ALL sessions (including CLI-started), submits the form, and returns a raw SDK error with no explanation.

Server code path (`session-manager.ts:127-128`):
```ts
const session = this.activeSessions.get(sessionId);
if (!session) throw new Error(`Session ${sessionId} not found`);
```

## Output

**Root cause confirmed:** CLI-started sessions are correctly excluded from `activeSessions`, but the UI shows the message input anyway and the error response is opaque.

**Fix — two parts:**

**Part 1 — Server route guard** (`server/src/http/routes/session-routes.ts`):
At `POST /sessions/:sessionId/message`, return HTTP 409 with a clear typed error before calling sendMessage if the session is not in activeSessions:
```json
{"error": "session_not_interactive", "message": "This session was started by the CLI and cannot receive messages from the dashboard. Use your terminal to continue this session."}
```

**Part 2 — UI: disable input for CLI sessions** (`dashboard/src/routes/SessionPage.tsx`):
Add `isInteractive: boolean` to the session metadata (either from `GET /api/sessions` response or a dedicated check). Render a disabled message input with explanatory text for non-interactive sessions: *"Use your terminal to continue this session."*

## Next Steps

```
/mas:bug-fix fix CLI session message error — see docs/brainstorms/2026-04-19-message-cli-session-error.md
```
