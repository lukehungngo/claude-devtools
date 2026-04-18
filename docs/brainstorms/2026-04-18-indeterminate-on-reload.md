# Brainstorm: "Session ended without completion" on reload

**Date:** 2026-04-18
**Input type:** Problem
**Input:** "i saw the 'Session ended without completion' a million time when try to reload the page many times to test the behavior, obviously the session is running so well on my cli"

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| CLI session is actively running | CONFIRMED | User observes session working fine in CLI |
| `isRunning` (2min mtime) is the right signal for "session is alive" | QUESTIONED | A session running a long bash tool writes nothing to JSONL for minutes |
| The dashboard has no better signal than mtime for CLI sessions | CONFIRMED | CLI sessions don't go through SessionManager; spec says `isRunning = mtime < 2min` |
| `session_state_changed` could fix this | QUESTIONED | Requires env var; only emitted by SDK for web UI sessions, not CLI JSONL |

## Fundamentals

**What is JSONL mtime?**
Claude Code writes to JSONL when events happen: user message, assistant response, tool result. During long tool execution (bash running for 3 minutes), NOTHING is written. mtime goes stale.

**What does `isRunning` (2min) mean?**
"The session wrote an event in the last 2 minutes." Not "the session is alive." A session executing a 5-minute bash command is running but silent.

**What does `isActive` (12h) mean?**
"The session was touched within the last 12 hours." A much safer proxy for "is this session dead?"

**What is `sessionIsActive` used for?**
In `getAgentStatus()`: if `!isAgentCompleted(events)` AND `!sessionIsActive` → return `"indeterminate"` ("Session ended without completion"). The question being answered is: "Is this session DEAD (truncated/aborted)?" NOT "Is this session currently streaming?"

**The code path on reload:**
```
reload
  → REST fetch → metrics.session.isRunning = (mtime < 2min)
  → ConversationView: sessionIsRunning = metrics?.session?.isRunning
  → TurnCard: sessionIsActive = sessionIsRunning !== false
  → getAgentStatus("main", events, false) → "indeterminate"
  → "Session ended without completion"
```

## Output

**Root cause confirmed.**

`sessionIsActive` uses `isRunning` (2-minute mtime) to answer the question "is this session dead?". The correct threshold is `isActive` (12 hours). A session that ran within 12 hours with no completion signal is running, not dead.

**The fix:** In `ConversationView.tsx` (~line 791), change:
```tsx
: metrics?.session?.isRunning
```
to:
```tsx
: metrics?.session?.isActive
```

`isRunning` answers "is it actively streaming?" (appropriate for the green dot in sidebar).
`isActive` answers "is this session dead?" (appropriate for indeterminate vs running turn status).

These are two different questions. The wrong one was used.

## Next Steps

`/mas:bug-fix` — one-line fix in `ConversationView.tsx`, `sessionIsRunning` fallback: `isRunning` → `isActive`
