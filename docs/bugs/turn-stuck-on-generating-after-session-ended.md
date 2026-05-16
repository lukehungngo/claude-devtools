# Bug: Last turn shows "Generating..." forever on sessions that are no longer streaming

**Severity:** P1 — wrong status on every dormant-but-recent session, dishonest UX
**Filed:** 2026-05-16
**Reported version:** v0.3.12
**Reporter symptom:** "Why is this session `8a362f78-212d-406c-87db-00d67cc2a186` on the frontend still showing in progress???"

## Symptom

Session `8a362f78-212d-406c-87db-00d67cc2a186` (claude-devtools / master) renders the last turn with:

- Amber pulsing dot
- "Generating... 8m 18s" (timer keeps counting up)
- Body banner: "Working..."

…even though the session has not produced any new event in ~30 minutes and the daemon has reported `idle` status the whole time.

The sidebar correctly shows the session is *not* actively streaming (steady green dot, no pulse). The discrepancy is **only inside the conversation pane** — the per-turn status indicator on the last turn.

## Server-side ground truth

For the affected session, `GET /api/repos` returns:

```json
{
  "id": "8a362f78-212d-406c-87db-00d67cc2a186",
  "isActive": true,        ← within 12-hour mtime window
  "isRunning": false,      ← daemon NOT busy, mtime > 2 minutes
  "daemonStatus": "idle",  ← authoritative daemon sidecar state
  "daemonAlive": true,
  "pid": 12749,
  "lastModified": "2026-05-16T15:25:46.718Z"
}
```

The server already knows the session is not actively producing events. The bug is entirely on the dashboard side.

## Root cause (verified)

`dashboard/src/components/conversation/ConversationView.tsx:872-880`

```tsx
sessionIsRunning={
  // Prefer authoritative SDK session_state_changed signal over mtime heuristic.
  // Fall back to isActive (12-hour mtime), NOT isRunning (2-minute mtime).
  // isRunning answers "is the session actively streaming?" (sidebar green dot).
  // isActive answers "is this session still alive?" (TurnCard indeterminate guard).
  streamingState.sessionState != null
    ? streamingState.sessionState === "running"
    : metrics?.session?.isActive       // ← THIS IS THE BUG
}
```

The prop is **named** `sessionIsRunning` but is wired to `metrics.session.isActive`. These mean different things on the server:

| Field | Server definition | Source |
|---|---|---|
| `isActive` | `mtime within 12 hours` | `server/src/cache/session-cache.ts:32,234` (`ACTIVE_THRESHOLD_MS = 12 * 60 * 60 * 1000`) |
| `isRunning` | daemon status (`busy`) **OR** SDK manager (`streaming`/`waiting-permission`) **OR** mtime within 2 min as last-ditch fallback | `server/src/http/routes/discovery-routes.ts:90-102` |

`isActive` answers "was this session touched in the last 12 hours" — a recency bucket, not a liveness bucket. `isRunning` is the authoritative "is this session producing events right now" signal, and it already incorporates daemon sidecar truth.

## Downstream effect

`dashboard/src/lib/agentStatus.ts:443-451` defines the three-state status as:

```ts
export function getAgentStatus(agentId, events, sessionIsActive): AgentStatus {
  if (isAgentCompleted(agentId, events)) return "completed";
  if (!sessionIsActive) return "indeterminate";
  return "running";
}
```

For the affected session:

1. Last main turn has no `end_turn` stop_reason (session was interrupted or daemon died mid-stream)
2. `isAgentCompleted("main", …)` → `false`
3. ConversationView passes `sessionIsRunning = isActive = true`
4. TurnCard's `sessionIsActive = true`
5. `getAgentStatus` returns `"running"`
6. TurnCard renders the amber pulsing dot, "Generating...", and an ever-growing elapsed timer

The correct render for an idle session whose last turn lacks a completion signal is `"indeterminate"`, which would show:

> ● Session ended without completion

(grey dot, no timer, no false sense of activity — see `TurnCard.tsx:208-220`).

## Why the original author chose isActive (and why it's still wrong)

The comment at line 874 documents the intent: keep `"Generating..."` visible during between-turn pauses (user is typing) because `isRunning`'s 2-minute window would prematurely flip to `"indeterminate"`.

This rationale conflates two distinct cases:

| Case | Last event in turn | end_turn present? | Should show |
|---|---|---|---|
| Active streaming (Claude generating) | tool_use / text chunks | no | running |
| Between turns (user typing prompt) | assistant text + `end_turn` | **yes** | completed |
| Session ended (interrupted) | partial assistant content | no | indeterminate |

The "between turns" case has `end_turn` in the previous assistant message, so `isAgentCompleted` returns `true` and `getAgentStatus` returns `"completed"` **regardless** of the `sessionIsActive` flag. The author's worry that switching to `isRunning` would cause flicker during user-typing pauses doesn't hold up — that path is gated by `isAgentCompleted` which returns true for properly-ended turns.

So the trade-off is:
- **Current (`isActive`)**: Every session with mtime <12h that ended without `end_turn` shows "Generating..." forever (for up to 12 hours). Highly visible false positive.
- **Proposed (`isRunning`)**: Same sessions correctly show "Session ended without completion". Brief (<1s) false negative only in the instant between user-submit and Claude-starts-streaming, before the daemon flips to `busy`.

## Fix (one line)

```diff
-      : metrics?.session?.isActive
+      : metrics?.session?.isRunning
```

Update the comment block above to match the new semantics — replace the "Fall back to isActive (12-hour mtime)" paragraph with:

```ts
// Fall back to isRunning (daemon-status-aware) — true only when the
// daemon reports busy or the SDK manager reports streaming. Sessions
// that ended without `end_turn` will correctly fall through to
// `indeterminate` instead of pulsing "Generating..." for 12 hours.
```

## Regression test (proposed)

Add to `dashboard/src/components/conversation/__tests__/ConversationView.test.tsx`:

1. Render `<ConversationView>` with a metrics object where `session.isActive = true` and `session.isRunning = false`, and a turns list whose last turn has no `end_turn`.
2. Assert the rendered last turn has `[data-testid="turn-completion-indicator"][data-status="indeterminate"]`.
3. Assert it does NOT render "Generating..." text.

This pins the corrected semantics and prevents future revival of the 12-hour false positive.

## Related

- `docs/bugs/synthetic-agent-instant-completion.md` — sibling bug class about status fidelity. Both stem from picking the wrong signal for "is this thing still happening".
- Architecture invariant #9 (CLAUDE.md): "Numbers must be correct. Status must match JSONL source. Wrong data is worse than no data." This bug is exactly that — the dashboard is overriding authoritative server-side liveness with a stale recency heuristic.
