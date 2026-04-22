# Claude DevTools

Claude DevTools is the observability layer for Claude Code — monitor active sessions in real-time, trace what happened turn-by-turn, and extract insights from your usage over time.

Works locally, inside Docker containers, and on remote servers.

## Features

- **Agent Flow Visualization**: Watch your agent's execution path in real-time as it processes tasks
- **Token Tracking**: Monitor input/output tokens, cache hits, and total consumption
- **Cost Analytics**: Track estimated API costs for your agent runs
- **Tool Monitoring**: See which tools are being called and their execution status
- **Live Updates**: WebSocket-based real-time updates to the dashboard
- **Remote & Docker**: Connect sessions from Docker containers or remote machines

## Installation

```bash
npx @lukehungngo/claude-devtools
```

The dashboard opens automatically at `http://localhost:3142`.

## Remote & Docker Connectivity

By default, claude-devtools reads Claude Code sessions from `~/.claude/projects/` on your local machine. To monitor sessions running inside Docker containers or on remote servers, use the collector.

### Docker (automatic)

If Docker is running on your machine, claude-devtools automatically detects containers that have Claude Code installed and injects a collector agent. No extra steps needed.

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

The collector streams new JSONL events to your local dashboard as they appear. Sessions from remote machines are tagged with a `remote:<hostname>` badge in the session list.

### Source badges

The session list shows where each session is running:

| Badge | Source |
|-------|--------|
| _(none)_ | Local filesystem |
| `docker:<name>` | Docker container (auto-detected) |
| `remote:<host>` | Remote collector |

### Connected collectors panel

The Settings panel shows all connected collectors with their status and session count.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEVTOOLS_PORT` | `3142` | Dashboard and collector hub port |
| `DEVTOOLS_TOKEN` | _(auto-generated)_ | Override the collector auth token |

## Development

### Setup

```bash
# Install all dependencies
cd server && pnpm install && cd ../dashboard && pnpm install
```

### Development Mode

```bash
# In terminal 1: Start the server with hot reload
cd server && pnpm dev

# In terminal 2: Start the dashboard with Vite dev server
cd dashboard && pnpm dev
```

The dashboard will be available at `http://localhost:5173` (Vite dev server).
The server runs on `http://localhost:3142`.

### Building

```bash
make build
```

### Testing

```bash
cd server && pnpm test && cd ../dashboard && pnpm test
```

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TypeScript
- **Real-time**: WebSocket (dashboard updates + collector hub on `/collect` path)
- **Styling**: TailwindCSS with `dt-*` design tokens

## Project Structure

```
claude-devtools/
├── server/              # Express server + session reader
│   ├── src/
│   │   ├── cli.ts          # Entry point — serve / collect / token
│   │   ├── http/           # HTTP + WebSocket server
│   │   ├── session/        # JSONL parsing and session management
│   │   ├── collector/      # Remote collector hub, agent, Docker injector
│   │   └── types.ts
│   └── package.json
├── dashboard/           # React SPA
│   ├── src/
│   │   ├── routes/         # Page-level components
│   │   └── components/     # UI components
│   └── package.json
├── skills/              # Claude Code skills
└── Makefile             # Build automation
```

## License

MIT
