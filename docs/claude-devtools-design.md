# Claude DevTools — Architecture Design

## Product Vision

A Claude Code plugin that launches a local browser dashboard for visualizing session logs, agent execution flows, token/cost metrics, and provides a command input interface — all sharing the same Claude Code session with zero extra auth.

## OKRs

| # | Objective | Key Result |
|---|-----------|------------|
| 1 | Local browser dashboard | Plugin spins up React SPA on `localhost:<port>`, auto-opens in browser |
| 2 | Full observability | Agent DAG, token usage, cost, tool calls, MCP calls, rules, bash commands, permissions — all visualized |
| 3 | Command input | Simple prompt box in browser → sends to Claude Code → streams response back |
| 4 | Zero auth | Same Claude Code session — plugin runs inside the process, no API keys needed |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code CLI                    │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │          claude-devtools plugin               │   │
│  │                                               │   │
│  │  ┌─────────────┐    ┌─────────────────────┐  │   │
│  │  │  MCP Server  │    │  HTTP/WS Server     │  │   │
│  │  │  (stdio)     │───▶│  (localhost:PORT)    │  │   │
│  │  │              │    │                     │  │   │
│  │  │  Tools:      │    │  Serves React SPA   │  │   │
│  │  │  - sessions  │    │  WebSocket for live  │  │   │
│  │  │  - metrics   │    │  event streaming     │  │   │
│  │  │  - command   │    │                     │  │   │
│  │  └─────────────┘    └─────────────────────┘  │   │
│  │                                               │   │
│  │  Skills:                                      │   │
│  │  - /devtools (open dashboard)                 │   │
│  │  - /session-report (generate report)          │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Reads: ~/.claude/projects/<hash>/*.jsonl            │
│  Reads: ~/.claude/projects/<hash>/*/subagents/*.jsonl│
└─────────────────────────────────────────────────────┘
         │
         │ WebSocket (localhost)
         ▼
┌─────────────────────────────────────────────────────┐
│              Browser Dashboard (React SPA)            │
│                                                       │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ │
│  │ Agent   │ │ Token /  │ │ Tool     │ │Command│ │
│  │ Flow    │ │ Cost     │ │ Inspector│ │ Input │ │
│  │ (DAG)   │ │ Metrics  │ │          │ │       │ │
│  └─────────┘ └──────────┘ └───────────┘ └────────┘ │
│                                                       │
│  ┌──────────────────────────────────────────────────┐│
│  │              Session Timeline                     ││
│  └──────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────┘
```

---

## JSONL Schema (What We Parse)

### Event Types

| Type | Description | Key Fields |
|------|-------------|------------|
| `queue-operation` | Enqueue/dequeue events | `operation`, `content` |
| `user` | User messages + tool results | `message.content[]`, `userType`, `toolUseResult` |
| `assistant` | Claude responses + tool calls | `message.content[]`, `message.usage`, `message.model` |
| `progress` | Long-running operation progress | `data.type`, `hookEvent`, `hookName` |

### Content Item Types (inside `message.content[]`)

| Type | Description | Key Fields |
|------|-------------|------------|
| `text` | Plain text response | `text` |
| `thinking` | Extended thinking | `thinking`, `signature` |
| `tool_use` | Tool invocation | `id`, `name`, `input` |
| `tool_result` | Tool response | `tool_use_id`, `content`, `is_error` |

### Token Usage (inside `message.usage`)

```json
{
  "input_tokens": 1234,
  "output_tokens": 567,
  "cache_creation_input_tokens": 890,
  "cache_read_input_tokens": 456,
  "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
  }
}
```

### File Locations

```
~/.claude/projects/<project-hash>/
├── <session-id>.jsonl                          # Main transcript
├── <session-id>/
│   └── subagents/
│       ├── agent-<id>.jsonl                    # Subagent transcript
│       └── agent-<id>.meta.json                # Agent metadata
└── memory/                                     # Memory files
```

---

## Plugin Structure

```
claude-devtools/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json                                   # MCP server config
├── skills/
│   └── devtools/
│       └── SKILL.md                            # /devtools skill
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                            # MCP stdio server entry
│       ├── parser/
│       │   ├── jsonl-parser.ts                 # JSONL file parser
│       │   ├── session-resolver.ts             # Find sessions from ~/.claude/
│       │   └── types.ts                        # TypeScript types for events
│       ├── analyzer/
│       │   ├── agent-dag.ts                    # Build parent→child agent graph
│       │   ├── token-tracker.ts                # Aggregate token/cost metrics
│       │   ├── tool-inventory.ts               # Enumerate and classify tools
│       │   └── permission-tracker.ts           # Track permission grants/denials
│       ├── http/
│       │   ├── server.ts                       # Express + WebSocket server
│       │   ├── routes.ts                       # REST API routes
│       │   └── watcher.ts                      # File watcher for live updates
│       └── tools/
│           ├── list-sessions.ts                # MCP tool: list sessions
│           ├── session-metrics.ts              # MCP tool: get session metrics
│           └── send-command.ts                 # MCP tool: proxy command
├── dashboard/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── AgentFlowDAG.tsx                # Reactflow-based agent DAG
│       │   ├── SessionTimeline.tsx             # Chronological event timeline
│       │   ├── TokenCostPanel.tsx              # Token usage + cost breakdown
│       │   ├── ToolInspector.tsx               # Tool call details + filters
│       │   ├── CommandInput.tsx                # Prompt input box
│       │   └── SessionSelector.tsx             # Pick session to visualize
│       ├── hooks/
│       │   ├── useWebSocket.ts                 # WS connection management
│       │   └── useSessionData.ts               # Parse + transform session data
│       └── lib/
│           ├── cost-calculator.ts              # Model × tokens → $ cost
│           └── dag-builder.ts                  # Events → DAG nodes/edges
├── README.md
└── Makefile                                    # build, dev, package commands
```

---

## Key Components

### 1. JSONL Parser (`server/src/parser/`)

Reads `~/.claude/projects/` directory, discovers sessions, parses JSONL files into typed events. Handles:
- Main session transcripts
- Subagent transcripts (in `subagents/` subdirectory)
- Agent metadata files (`.meta.json`)
- Incremental parsing (for live mode — only read new lines)

### 2. Analyzers (`server/src/analyzer/`)

**Agent DAG Builder:**
- Traverse events, link by `parentUuid` / `agentId`
- Build tree: Session → Agent → SubAgent
- Track agent types from `.meta.json`
- Output: nodes + edges for ReactFlow

**Token Tracker:**
- Aggregate `message.usage` across all events
- Per-model breakdown (opus vs sonnet vs haiku)
- Cache hit rate (cache_read / total_input)
- Cost calculation using known pricing

**Tool Inventory:**
- Count by tool name (Bash, Read, Write, Edit, Grep, Glob, Agent, MCP tools)
- Separate MCP tools by server (e.g., `mcp__notion__search`)
- Track success/error rates from `tool_result.is_error`
- Duration estimation (timestamp diff between tool_use and tool_result)

**Permission Tracker:**
- Parse permission-related events
- Track grants, denials, permission mode

### 3. HTTP/WebSocket Server (`server/src/http/`)

- **REST API:** `/api/sessions` (list), `/api/sessions/:id` (detail), `/api/sessions/:id/metrics`
- **WebSocket:** Push new events as JSONL file grows (using `fs.watch`)
- **Static files:** Serve built React SPA from `dashboard/dist/`
- **Port:** Random available port, printed to console on startup

### 4. React Dashboard (`dashboard/`)

**Views:**

| View | Description | Library |
|------|-------------|---------|
| Agent Flow DAG | Interactive directed graph of agent→subagent relationships | `@xyflow/react` (ReactFlow) |
| Session Timeline | Chronological list of events with expandable details | Custom, virtualized with `react-window` |
| Token/Cost Panel | Bar/pie charts for token usage, cost breakdown by model | `recharts` |
| Tool Inspector | Filterable table of all tool calls with input/output | Custom table |
| Command Input | Text area + send button, response streaming area | Custom |
| Session Selector | Dropdown/sidebar to pick which session to view | Custom |

### 5. Command Input (v1 — Simple)

**Architecture:**
```
Browser → POST /api/command → Server → spawn `claude -p "prompt"` → stream stdout → WebSocket → Browser
```

- Uses `claude -p` (print mode, non-interactive)
- Streams response chunks back via WebSocket
- No tool approval UI in v1 — runs in auto-accept mode
- Inherits the current project context from cwd

---

## Cost Calculation

Using known Anthropic pricing (as of March 2026):

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| Claude Opus 4 | $15/M | $75/M | $18.75/M | $1.50/M |
| Claude Sonnet 4 | $3/M | $15/M | $3.75/M | $0.30/M |
| Claude Haiku 3.5 | $0.80/M | $4/M | $1/M | $0.08/M |

Prices configurable in `cost-calculator.ts` for future model updates.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| MCP Server | TypeScript, `@modelcontextprotocol/sdk` |
| HTTP Server | Express.js + `ws` (WebSocket) |
| File Watcher | Node.js `fs.watch` + `chokidar` |
| Dashboard | React 18 + Vite + TypeScript |
| DAG Visualization | `@xyflow/react` (ReactFlow) |
| Charts | `recharts` |
| Virtual Lists | `react-window` |
| Styling | Tailwind CSS |
| Packaging | esbuild (server bundle) + Vite (dashboard) |

---

## Data Flow

```
1. Plugin installed → MCP server starts (stdio)
2. User invokes /devtools skill or MCP tool
3. Server discovers ~/.claude/projects/ sessions
4. Server parses JSONL → typed events
5. Analyzers compute: DAG, tokens, tools, permissions
6. HTTP server starts on random port
7. Browser opens → loads React SPA
8. SPA fetches /api/sessions → renders session list
9. User picks session → SPA fetches /api/sessions/:id
10. ReactFlow renders agent DAG
11. File watcher detects new JSONL lines → pushes via WebSocket
12. Dashboard updates in real-time
```

---

## Metrics Dashboard (OKR 2 Detail)

### Summary Cards (Top Row)
- **Total Cost:** $X.XX (calculated from token usage × model pricing)
- **Total Tokens:** Input / Output / Cache
- **Duration:** Session wall-clock time
- **Agent Count:** Main + N subagents
- **Tool Calls:** Total count with error rate

### Agent Flow Panel
- Interactive DAG showing session → agents → subagents
- Node colors by agent type (Explore=cyan, Plan=yellow, general=blue)
- Edge labels showing token flow
- Click node → drill into that agent's events

### Token Breakdown Panel
- Stacked bar chart: input vs output vs cache_write vs cache_read per turn
- Cumulative line chart showing token burn over time
- Pie chart: cost by model tier
- Cache hit rate percentage

### Tool Usage Panel
- Bar chart: tool call frequency by name
- MCP tool calls grouped by server
- Success/error rate per tool
- Bash command list with exit codes

### Rules & Config Panel
- Active rules loaded (from CLAUDE.md, .claude/rules/)
- Permission mode
- MCP servers connected
- Hooks registered

---

## Open Questions

1. **Port management:** Use a fixed port (e.g., 3142) or random? Fixed is easier for bookmarking but risks conflicts.
2. **Session discovery:** Watch all projects or only the current project?
3. **Data retention:** How many sessions to keep in memory? Paginate for large histories?
4. **Command input scope:** Should `claude -p` inherit the plugin's project context or use a fresh context?

---

## Phase Plan

| Phase | Scope | Est. Effort |
|-------|-------|-------------|
| P0 | Plugin scaffold + JSONL parser + types | 1 day |
| P1 | HTTP server + REST API + session discovery | 1 day |
| P2 | React SPA with agent DAG + token metrics | 2 days |
| P3 | Live streaming (file watcher → WebSocket) | 0.5 day |
| P4 | Command input (simple prompt box) | 0.5 day |
| P5 | Polish, packaging as .plugin, README | 0.5 day |
