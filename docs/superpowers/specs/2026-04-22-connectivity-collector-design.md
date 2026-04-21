# Connectivity — Collector Agent Design

**Date:** 2026-04-22  
**Status:** Approved  
**Scope:** Remote and Docker connectivity for claude-devtools

---

## Problem

The devtools server reads `~/.claude/projects/**/*.jsonl` directly from the local filesystem and binds to `127.0.0.1:3142`. When Claude Code runs inside a Docker container or on a remote server, the JSONL files are on a different machine. No data reaches the dashboard.

---

## Goals

- Local Claude Code (existing): zero change, works today
- Docker (same local machine): zero config, auto-detected
- Remote server: one command on the remote side, token from local machine
- Primary topology: local dashboard ← remote data (topology A)
- Secondary topology: server on remote, browser port-forwards (topology B — supported via SSH, no new code)
- Solo first, team-ready later (multi-collector → one server)

---

## Architecture

```
[Local machine]                          [Remote / Docker]
  devtools server                          collector agent
  ├── local watcher (existing)             ├── chokidar → ~/.claude/projects/
  ├── collector hub  ←──WS port 3143──────  ├── WebSocket client
  │    ├── collector: docker:my-container   └── streams new-events + new-session
  │    └── collector: remote:dev.box
  ├── merged event stream
  └── browser dashboard
       └── sessions from ALL sources unified
```

**Two ports:**

| Port | Bind | Purpose |
|------|------|---------|
| 3142 | `127.0.0.1` | Dashboard (browser only, unchanged) |
| 3143 | `0.0.0.0` | Collector hub (remote agents, token-authenticated) |

---

## Collector Agent

A new subcommand of the existing binary: `claude-devtools collect`.

### Startup handshake

```
collector → server:  { type: "collector-hello", token: "dt_xxx", source: "remote:dev.box" }
server   → collector:  { type: "collector-ok" }
server   → collector:  close (if token invalid)
```

### Runtime messages

Same message types as the local watcher, with `source` added:

```ts
{ type: "new-events",  sessionId, filePath, events, source: "remote:dev.box" }
{ type: "new-session", sessionId, filePath,          source: "remote:dev.box" }
```

Source format:
- `local` — local filesystem (existing)
- `docker:<container-name>` — auto-injected Docker collector
- `remote:<hostname>` — manually started remote collector

### Resilience

- Auto-reconnect with exponential backoff: 1s → 2s → 4s → max 30s
- Byte offsets tracked locally — no events re-sent after reconnect
- Heartbeat ping/pong every 30s

---

## Docker Auto-Inject

On server startup, if `/var/run/docker.sock` exists:

1. List running containers via Docker API
2. For each container where `docker exec <id> test -d /root/.claude/projects` (or `~/.claude/projects` for non-root users) exits 0, run:
   ```bash
   docker exec <container-id> claude-devtools collect \
     --server ws://host.docker.internal:3143 \
     --token <token>
   ```
   in a detached subprocess
3. Re-check every 60s for newly started containers
4. Tag all events from that container as `docker:<name>`

---

## Auth & Token

**Token lifecycle:**
- Generated once on first server run, saved to `~/.claude/devtools.token`
- Printed to stdout on startup
- `claude-devtools token` prints it again

**Remote user flow:**
```bash
# On local machine — get token
claude-devtools token

# On remote machine — start collector
npx @lukehungngo/claude-devtools collect \
  --server ws://192.168.1.10:3143 \
  --token dt_a3f9b2c1...
```

**Environment overrides:**
```bash
DEVTOOLS_PORT=3142            # dashboard port (existing)
DEVTOOLS_COLLECTOR_PORT=3143  # collector hub port
DEVTOOLS_TOKEN=dt_...         # override auto-generated token
```

---

## Dashboard Changes

### Source badge on session list

```
┌─────────────────────────────────────┐
│ claude-devtools          local  ●   │
│ my-api-project       docker:app ●   │
│ infra-scripts      remote:dev.box   │
└─────────────────────────────────────┘
```

- `local` — no badge (default)
- `docker:<name>` — blue badge
- `remote:<host>` — purple badge

### Connected collectors panel (Settings or sidebar)

```
Collectors
  ✓ docker:app          connected   2 sessions
  ✓ remote:dev.box      connected   5 sessions
  ✗ remote:old-server   lost connection 3m ago
```

Shows: source name, connection status, session count, last-seen time.  
No manual controls in v1 — collectors self-reconnect.

### No other dashboard changes

Session detail, DAG, turn graph, insights — all work identically regardless of source. `source` is metadata only.

---

## Architecture Invariants — Additions

1. **JSONL is still read-only** — collectors never write, only read and forward
2. **Local watcher is unchanged** — collector hub is additive, not a replacement
3. **Token required for all collector connections** — unauthenticated connections are immediately closed
4. **Dashboard port stays localhost-only** — only the collector hub port opens to the network

---

## Out of Scope (v1)

- Collector management UI (start/stop from dashboard)
- Encrypted transport (TLS) — token auth over LAN is sufficient for v1
- Automatic remote SSH tunnel setup
- Session deduplication across sources (same session ID from two sources)
- Topology B implementation (server on remote) — works today via SSH tunnel, no new code needed
