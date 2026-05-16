# Claude DevTools

Claude DevTools is the observability layer for Claude Code — monitor active sessions in real-time, trace what happened turn-by-turn, and extract insights from your usage over time.

Works locally, inside Docker containers, and on remote servers. Built directly against the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.x) and the CC daemon's on-disk sidecars, so every signal is authoritative — no heuristics where the SDK or filesystem already has the truth.

## Quick start

```bash
npx @lukehungngo/claude-devtools
```

The dashboard opens automatically at `http://localhost:3142`.

## What you get

### Real-time session view

- **Live tool calls** with streaming `tool_use` / `tool_result` events, including PowerShell tool support for Windows + Bedrock / Vertex / Foundry users.
- **Streaming thinking** blocks, response tokens, status indicator, and a per-turn completion footer that distinguishes `running` / `completed` / `indeterminate` honestly (it knows the difference between a stale session and an in-flight one).
- **"Background this task"** button on long-running tool calls — programmatic `Ctrl+B` via `query.backgroundTasks()`. Frees the turn while the work continues; status flips on the next `task_notification`.

### Subagent tracking

- **Background Agent group** under each turn shows asynchronous Agent / Task dispatches with active / completed / error status, anchored by the dispatching `tool_use.id`.
- Uses CC's authoritative `<task-notification>` markers as the completion signal (kills the false "instantly done" bug for `run_in_background: true` dispatches).
- Subagent → dispatcher attribution uses the SDK's `parent_tool_use_id` field directly when present, with a 5-second temporal fallback only for legacy sessions where the SDK didn't emit it yet.

### Tasks tab — daemon-backed + live

- Reads CC's authoritative task store at `~/.claude/tasks/<sessionId>/<n>.json` (status, subject, blocks, blockedBy).
- Merges live SDK `task_started` / `task_progress` / `task_updated` / `task_notification` messages on top, so you see running token / tool-use / duration counters, the last-tool name, and a Moon icon for backgrounded tasks.
- Per-row **stop button** (`query.stopTask()`) with an inline confirmation row.

### Hooks tab

- One row per hook execution from JSONL `attachment` events plus live in-flight rows from `hook_started` / `hook_progress` / `hook_response` (spinner + elapsed counter, replaces with the completed row on response).
- Columns: event type, hook name, tool-use id, duration, exit code, stdout/stderr preview.
- Surfaces the SDK `terminalSequence` field with a Bell icon when a hook emits a desktop notification.
- Distinguishes hooks from Monitor / TaskCreate `task-notification` queued commands via a Source column.
- Session totals: count, failed (non-zero exit), cancelled, average duration, total time-in-hooks.

### Compaction visibility

- **Real metadata** from the SDK `compact_boundary` event (camelCase `compactMetadata` from JSONL, snake_case `compact_metadata` from the SDK stream — both handled).
- Banner shows `"auto-compacted — 168,470 → 8,759 tokens (-95%), 60.8s"`.
- **PreCompact / PostCompact hook attribution**: when a hook is responsible (success or block), the banner names it. Blocked compactions render in amber with the hook's reason.
- **Static markers** for replayed historical sessions show inline "auto-compacted at turn 42 — 168K → 9K" between turns.

### Auto-denial visibility

- Distinct `AutoDenialBlock` rows for SDK `permission_denied` messages — classifier / rule / mode / asyncAgent denials get color-coded badges and the model-facing rejection text. Different surface from the interactive PermissionBlock for user-driven approvals.

### Usage breakdown (live SDK sessions)

Powered by `query.getContextUsage()`, the Usage tab shows per-session:

- Per-model token totals + cache-hit ratio
- Per-MCP-server token cost
- Per-subagent token cost
- Skills overhead, slash command overhead
- Message-level breakdown: tool calls / tool results / attachments / assistant / user / unattributed
- **Authoritative `autoCompactThreshold`** (replaces hardcoded 80% in the context warning banner)

Historical sessions fall back to JSONL aggregation, so the tab works everywhere.

### MCP server status

- New **MCP** tab listing every configured server with its live status: `connected` / `failed` / `needs-auth` / `pending` / `disabled`, plus the error message inline when failed and the version/scope/transport when connected.

### Daemon-aware session list

- Reads `~/.claude/sessions/<pid>.json` (CC's daemon sidecar) for authoritative session status — replaces mtime guessing.
- Pulsing green dot for `busy`, steady green for `idle`, amber for stale (`alive: false`).
- Entrypoint badge: `bg` (sdk-cli — `claude --bg` or `claude agents` dispatched), `desk` (Claude Desktop), or hidden for the default `cli`.
- **Remote Control bridge indicator** (Radio icon) when `bridgeSessionId` is set — your session is connected via claude.ai.

### Rewind and fork

- Rewind menu with three actions: restore code + conversation, **"Summarize up to here"** (bounded `/compact` dispatched at the picked user message), and Fork session.

### Bidirectional hook ↔ tool highlight

- Hover a hook row in the Hooks tab → its `tool_use` lights up in the conversation, and vice versa. Wired through a layout-scoped context so memo invalidation is leaf-level (530+ rows don't re-render on every hover).

### Other surfaces

- **Purge project** action with dry-run-first confirmation modal — wraps `claude project purge`.
- **OpenTelemetry result fields**: `stop_reason` and `gen_ai.response.finish_reasons` surfaced in CostTab when the SDK emits them.
- **29 hook event types** in the HookEditor (imported directly from the SDK's `HOOK_EVENTS` constant) — covers PostToolBatch, SessionEnd, StopFailure, PostCompact, Permission{Request,Denied}, TeammateIdle, TaskCompleted, Elicitation*, ConfigChange, Worktree*, InstructionsLoaded, CwdChanged, FileChanged in addition to the basic 12.
- **Effort levels** include `xhigh` (Opus 4.7) and `max`.
- **Static type alignment** with SDK 0.3.143: narrowed enums for `SDKStatus`, session state, and compact trigger.

## Remote & Docker

By default, claude-devtools reads sessions from `~/.claude/projects/` on your local machine. To monitor sessions running elsewhere, use the collector.

### Docker (automatic)

If Docker is running on your machine, claude-devtools auto-detects containers whose `~/.claude/projects` directory exists and injects a collector. Once detected, sessions inside the container appear in the sidebar with a `docker:<name>` source badge (see [Source badges](#source-badges) below). New containers are picked up on the next scan (within 60 seconds).

**Requirements:**

- Docker socket at `/var/run/docker.sock` (Docker Desktop, native Docker Engine). Colima, OrbStack, rootless Docker, and Podman users with sockets at non-standard paths are not yet auto-detected — use the [Remote server](#remote-server) flow below.
- On **Linux Docker Engine**, containers must be started with `--add-host=host.docker.internal:host-gateway` so the collector can reach the host. Docker Desktop on macOS/Windows handles this automatically.
- The container must have `npx` available (any image with Node.js; usually true when Claude Code is installed inside).

### Remote server

**1. Get your token** (on your local machine):

```bash
npx @lukehungngo/claude-devtools token
```

**2. Start the collector** (on the remote machine):

```bash
npx @lukehungngo/claude-devtools collect \
  --server ws://<your-local-ip>:3142 \
  --token <token>
```

The collector streams new JSONL events to your local dashboard as they appear.

### Source badges

| Badge | Source |
|-------|--------|
| _(none)_ | Local filesystem |
| `docker:<name>` | Docker container (auto-detected) |
| `remote:<host>` | Remote collector |

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEVTOOLS_PORT` | `3142` | Dashboard and collector hub port |
| `DEVTOOLS_TOKEN` | _(auto-generated)_ | Override the collector auth token |

## Development

### Setup

```bash
cd server && pnpm install && cd ../dashboard && pnpm install
```

### Run

```bash
# Terminal 1: server with hot reload
cd server && pnpm dev

# Terminal 2: Vite dev server
cd dashboard && pnpm dev
```

Dashboard: `http://localhost:5173`. Server: `http://localhost:3142`.

### Build

```bash
make build
```

### Test

```bash
cd server && pnpm test && cd ../dashboard && pnpm test
```

## Architecture invariants

A handful of rules the codebase enforces in tests and PR review:

1. **JSONL is the source of truth.** Server is read-only against `~/.claude/projects/` JSONL files; never mutates session data.
2. **Byte-offset incremental parsing.** Uses `openSync`/`readSync` with byte offsets to read only new data. No file re-reads.
3. **Fail-safe parsing.** Both full and incremental parsers catch JSON errors per-line and continue.
4. **Metrics computed server-side.** Dashboard receives pre-computed `SessionMetrics`; consistent numbers across clients.
5. **WebSocket broadcasts only new events.** Dashboard fetches full session via REST first, then layers live events.
6. **Active sessions stream SDK events directly.** Sessions started from the web UI flow from the SDK `query()` iterator via SSE.
7. **Permission resolution is Promise-based.** `canUseTool` returns a Promise that resolves on dashboard click; 10-minute timeout.
8. **Low latency, high performance.** O(1) per event in hot paths; cached reads; memoized renders.

See `docs/spec/cc-parity-gaps.md` and `docs/spec/sdk-replaces-guesswork.md` for the full audit trail behind these features.

## Tech stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TypeScript + TailwindCSS (`dt-*` tokens)
- **Real-time**: WebSocket (dashboard) + Server-Sent Events (SDK live stream) + WebSocket on `/collect` (remote collectors)
- **SDK**: `@anthropic-ai/claude-agent-sdk` 0.3.143

## License

MIT — see `LICENSE`.
