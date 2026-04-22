# Brainstorm: Why /clear, /compact, /effort show as "keep running"

**Date:** 2026-04-20
**Input type:** Observation
**Input:** why command like /clear, /compact, /effort show keep running event those /effort and /clear is one shot command

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| "keep running" = the dashboard shows a running/pulsing indicator on the turn | CONFIRMED | TurnHistoryPanel has `data-testid="running-dot"` driven by `isAgentCompleted("main", events)` |
| /compact is forwarded to the SDK; /clear and /effort are handled client-side | CONFIRMED | `slashCommandHandler.ts`: `/compact` returns `false`, `/clear`+`/effort` return `true` |
| The dashboard derives turn completion from JSONL: `end_turn`, `turn_duration`, or parent `tool_result` | CONFIRMED | `agentStatus.ts` `isAgentCompleted()` — three-signal predicate |
| A session is "active" for 12 hours after last JSONL write | CONFIRMED | `session-cache.ts` `ACTIVE_THRESHOLD_MS = 12 * 60 * 60 * 1000` |
| One-shot commands written from the CLI create user events WITHOUT a matching assistant response | CONFIRMED (inferred) | `turnSnapshot.ts` `isSystemInjectedText()` allows `<command-name><command-message>` format as turn boundaries — these are CLI-written events |
| /compact eventually generates an assistant response with end_turn | QUESTIONED | Spec says `compact_boundary` is written but doesn't confirm `turn_duration` follows |

## Fundamentals

### Truth 1: Turn completion is PURELY signal-driven
`isAgentCompleted` requires one of three signals: `end_turn` (stop_reason on assistant event), `turn_duration` (system event), or parent tool_result (for subagents). No signal = "running".

### Truth 2: LLM-backed turns always produce completion signals; non-LLM turns never do
Normal turns: user → Claude LLM call → assistant event (end_turn) + system/turn_duration → done.
One-shot commands: user → Claude Code internal processing (NO LLM call) → nothing written to JSONL → no completion signal ever.

### Truth 3: JSONL user events from CLI slash commands ARE treated as turn boundaries
`turnSnapshot.ts:isTurnBoundary()` accepts user events with `<command-name><command-message>` format. So `/effort high` and `/clear` typed in the CLI create turns that the dashboard tracks.

### Truth 4: Session remains "active" for 12 hours — so these turns pulse "running" all day
Once a session file is modified, `isActive = true` for 12h. Combined with no completion signal, any turn without `end_turn`/`turn_duration` shows `AgentStatus = "running"` for the full active window.

### Truth 5: The dashboard's client-side handling of /effort and /clear doesn't write JSONL
When you type `/effort high` in the dashboard's PromptInput, it's handled by `handleSlashCommand` (returns `true`, never sets `running = true`, never sends to SDK). So the dashboard case is fine — the issue is for CLI-typed commands.

## Root Cause

**Two separate failure modes, not one:**

### Mode A: CLI-typed one-shot commands (/effort, /clear via terminal)
When a user types `/effort high` or `/clear` in the Claude Code terminal:
1. Claude Code writes a `user` event to JSONL (`<command-name>/effort</command-name><command-message>...</command-message>`)
2. Claude Code processes the command internally (no LLM call)
3. **No assistant event is written** — there's nothing to respond with
4. **No `turn_duration` system event is written** — that only follows LLM turns
5. The JSONL ends with an open user event → dashboard sees a turn with no completion signal
6. Session file is touched → `isActive = true` for 12h
7. Result: "running" indicator pulses all day for a command that finished in milliseconds

### Mode B: /compact — possibly missing turn_duration
`/compact` IS backed by a Claude LLM call (Claude generates a compaction summary). It should emit:
- Assistant event (the summary)
- Possibly `end_turn` as stop_reason → Signal 1 ✓
- Possibly `compact_boundary` system event (not `turn_duration`)

If Claude Code writes `compact_boundary` but NOT `turn_duration` after `/compact`, and if the assistant's stop_reason is `max_tokens` (content was truncated), then `isAgentCompleted` finds no signal → "running" forever.

This needs empirical verification against real JSONL (unconfirmed).

## Core Design Mismatch

The completion detection system was designed for normal user↔LLM turns. Slash commands represent a third category — **command turns** — where:
- A user event creates a turn boundary (correct)
- But the "response" is either absent (one-shot) or atypical (compact summary)
- The completion signals the dashboard expects are absent or unreliable

The 12-hour active window amplifies this: a completed one-shot command produces a stale "running" dot for hours.

## Solution Directions

### Direction 1 (Quickest win): Classify known one-shot commands as auto-completed
In `isTurnBoundary()` or `buildTurnsFromEvents()`, detect that a user event whose content is a known one-shot command (`/effort`, `/clear`, `/init`, etc.) should be treated as **completed immediately** if no subsequent assistant event follows within the same turn window.

Concretely: if last user event's text matches known one-shot command regex AND no assistant event follows AND it's not a pending active query → status = "indeterminate" (honest) or skip the running dot.

### Direction 2: Extend the completion signal set
Add a check: if the user event is a slash command AND the next event in JSONL is a new user event (next turn) OR the session is closed → the slash command turn is implicitly completed.

### Direction 3: Context-based suppression
When `promptType === "command"` (detected by `promptClassifier.ts`) and the turn has no assistant response, suppress the running indicator entirely. Commands don't need a "still running" dot — they either finish or they don't.

## Next Steps

The cleanest fix is Direction 3: use `promptClassifier.classifyPrompt(promptText)` already available, check `type === "command"`, and skip the running dot for command turns that lack an assistant response. This is O(1), doesn't change the completion predicate, and doesn't require knowing which specific commands are one-shot.
