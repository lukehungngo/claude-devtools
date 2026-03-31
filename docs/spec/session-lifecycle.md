# Session Lifecycle

How Claude Code sessions start, stream, compact, checkpoint, fork, and end.

---

## Session States

```
          ┌──────────────────────────────────────────────┐
          │                                              │
  new ──→ idle ──→ streaming ──→ idle (turn complete)    │
                      │                                  │
                      ├──→ waiting-permission ──→ streaming
                      │
                      └──→ error
```

Our `SessionManager` tracks this via `ActiveSession.status`.

---

## Starting a Session

### From Web UI
1. `POST /api/sessions/new` with `{ cwd }` → returns `{ sessionId }`
2. `SessionManager.startSession(cwd)` creates `ActiveSession`
3. First `POST /api/sessions/:id/message` triggers `query({ prompt, resume: sessionId })`

### From CLI (Historical)
1. User runs `claude` in terminal
2. Claude Code creates JSONL at `~/.claude/projects/{hash}/{sessionId}.jsonl`
3. Our watcher detects the file → broadcasts `new-session`
4. Dashboard shows it in sidebar

### Resuming
1. `POST /api/sessions/:id/resume` with `{ cwd }` → registers in SessionManager
2. Next message uses `query({ resume: sessionId })` → SDK replays history from JSONL

**SDK alternative we don't use:** `query({ continue: true })` resumes the most recent session in the working directory.

---

## Streaming (Active Turn)

```
User sends prompt
  → query({ prompt, resume: sessionId, includePartialMessages: true })
  → SDK spawns Claude Code subprocess
  → SDK replays session history (10-30s for long sessions)
  → SDK begins streaming new response
    → stream_event: content_block_start (text/thinking/tool_use)
    → stream_event: content_block_delta (incremental content)
    → stream_event: content_block_stop
    → (if tool_use): canUseTool callback → permission flow
    → (if tool_use): tool executes → user event with tool_result
    → (if tool_use): next assistant turn processes result
    → ... (loop until stop_reason === "end_turn")
  → assistant: final complete message
  → result: { total_cost_usd, usage, duration_ms, num_turns }
```

**Important latency note:** `query({ resume })` replays the full session history. For a 50-turn session, this means 10-30s reconstruction before the new prompt is processed. Our `<50ms` target applies only AFTER reconstruction.

---

## Context Compaction

When context window fills up:

1. SDK detects high context usage
2. Emits `system` event with `subtype: "status"`, content `"compacting"`
3. Compacts conversation (summarizes old turns)
4. Emits `system` event with `subtype: "compact_boundary"`:
   ```json
   {
     "compact_metadata": {
       "trigger": "auto" | "manual",
       "pre_tokens": 180000
     },
     "preserved_segment": {
       "start_uuid": "...",
       "end_uuid": "..."
     }
   }
   ```
5. Resumes with reduced context

**Manual compact:** `/compact [focus]` triggers compaction with optional focus instructions.

**Our status:** `/compact` sends text to SDK. We don't show progress or before/after token counts. The `compact_boundary` event from the SDK stream is dropped.

---

## File Checkpoints / Rewind

If `enableFileCheckpointing: true` in query options:

1. File states are saved at each user message
2. `query.rewindFiles(userMessageId)` restores files to that point
3. `dryRun: true` previews what would change

**5 rewind options** (CLI provides these as a menu):
1. Restore code AND conversation
2. Restore conversation only
3. Restore code only
4. Summarize forward conversation
5. Cancel

**Our status:** Don't enable file checkpointing. /rewind is text passthrough. Should use `query.rewindFiles()` for proper checkpoint restore.

---

## Session Forking

```typescript
// SDK function
function forkSession(sessionId: string, options?: {
  atUserMessage?: string;   // Fork point (default: current)
  cwd?: string;
}): Promise<ForkSessionResult>;

// Query option
query({ resume: sessionId, forkSession: true })
```

Creates a new session branching from an existing one. Original session unmodified.

**Our status:** Returns 501 Not Implemented.

---

## Session Naming

```typescript
// SDK functions
function renameSession(sessionId: string, title: string): Promise<void>;
function tagSession(sessionId: string, tag: string | null): Promise<void>;
```

Renames persist to JSONL as `system` events with `subtype: "custom-title"`.

**Our status:** localStorage-only naming. Should use `renameSession()` for persistence.

---

## Garbage Collection

Our SessionManager runs GC every 5 minutes:
- Removes idle sessions older than 1 hour
- Permission promises time out after 10 minutes
- Question promises time out after 10 minutes

---

## Session Storage on Disk

```
~/.claude/projects/
  {projectHash}/
    {sessionId}.jsonl                          # Main session
    {sessionId}/
      subagents/
        agent-{agentId}.jsonl                  # Subagent conversation
        agent-{agentId}.meta.json              # { agentType, description }
```

`projectHash` is a sanitized representation of the working directory path.

Session metadata is extracted from the first 10 events (cwd, gitBranch, model, permissionMode) and last 20 events (custom-title, recent model).

**Session activity detection:**
- `isActive`: modified within 12 hours
- `isRunning`: modified within 2 minutes
