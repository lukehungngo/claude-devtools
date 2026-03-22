# Claude DevTools Plugin — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that launches a local browser dashboard for visualizing session logs, agent execution flows, token/cost metrics, and provides a simple command input interface.

**Architecture:** MCP stdio server (TypeScript/Node.js) that parses JSONL transcripts from `~/.claude/projects/`, serves a React SPA via a local Express+WebSocket server on port 3142. The plugin is self-contained — zero auth, inherits Claude Code's file system access.

**Tech Stack:** TypeScript, Node.js, Express, ws (WebSocket), React 18, Vite, @xyflow/react (ReactFlow), recharts, Tailwind CSS, esbuild, @modelcontextprotocol/sdk

---

## File Structure

```
claude-devtools/
├── .claude-plugin/
│   └── plugin.json                     # Plugin manifest
├── .mcp.json                           # MCP server config (stdio)
├── skills/
│   └── devtools/
│       └── SKILL.md                    # /devtools skill definition
├── server/
│   ├── package.json                    # Server dependencies
│   ├── tsconfig.json                   # TypeScript config (strict)
│   └── src/
│       ├── index.ts                    # MCP stdio server entrypoint
│       ├── types.ts                    # All TypeScript types
│       ├── parser/
│       │   ├── jsonl-reader.ts         # Read + parse JSONL files
│       │   └── session-discovery.ts    # Find sessions in ~/.claude/
│       ├── analyzer/
│       │   ├── dag-builder.ts          # Events → agent DAG
│       │   ├── metrics.ts              # Token/cost aggregation
│       │   └── tool-stats.ts           # Tool usage stats
│       ├── http/
│       │   ├── server.ts               # Express + WS + static files
│       │   ├── routes.ts               # REST API endpoints
│       │   └── watcher.ts              # JSONL file watcher → WS push
│       └── tools/
│           ├── open-dashboard.ts       # MCP tool: open browser
│           └── session-list.ts         # MCP tool: list sessions
├── dashboard/
│   ├── package.json                    # Dashboard dependencies
│   ├── index.html                      # Vite entry
│   ├── vite.config.ts                  # Vite config
│   ├── tailwind.config.js              # Tailwind config
│   ├── postcss.config.js              # PostCSS for Tailwind
│   └── src/
│       ├── main.tsx                    # React entry
│       ├── App.tsx                     # Root component + router
│       ├── hooks/
│       │   ├── useWebSocket.ts        # WS connection + reconnect
│       │   └── useSessionData.ts      # Fetch + transform session
│       ├── lib/
│       │   ├── cost.ts                # Token → cost calculator
│       │   └── types.ts               # Shared frontend types
│       ├── components/
│       │   ├── Layout.tsx             # App shell + sidebar
│       │   ├── SessionSelector.tsx    # Session picker sidebar
│       │   ├── SummaryCards.tsx        # Top-row metric cards
│       │   ├── AgentFlowDAG.tsx       # ReactFlow agent graph
│       │   ├── SessionTimeline.tsx    # Event timeline
│       │   ├── TokenChart.tsx         # Token/cost charts
│       │   ├── ToolStats.tsx          # Tool usage breakdown
│       │   └── CommandInput.tsx       # Prompt input box
│       └── styles/
│           └── globals.css            # Tailwind imports
├── Makefile                           # dev, build, package commands
└── README.md                          # Usage docs
```

---

## Chunk 1: Plugin Scaffold + Types + Parser

### Task 1: Initialize plugin manifest and config

**Files:**
- Create: `claude-devtools/.claude-plugin/plugin.json`
- Create: `claude-devtools/.mcp.json`
- Create: `claude-devtools/skills/devtools/SKILL.md`
- Create: `claude-devtools/Makefile`

- [ ] **Step 1: Create plugin manifest**

```json
// claude-devtools/.claude-plugin/plugin.json
{
  "name": "claude-devtools",
  "version": "0.1.0",
  "description": "Browser dashboard for visualizing Claude Code session logs, agent flows, token usage, and costs. Includes command input.",
  "author": {
    "name": "AgentWall"
  },
  "keywords": ["devtools", "visualization", "debugging", "observability"]
}
```

- [ ] **Step 2: Create MCP server config**

```json
// claude-devtools/.mcp.json
{
  "mcpServers": {
    "claude-devtools": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/dist/index.js"],
      "env": {
        "DEVTOOLS_PORT": "3142"
      }
    }
  }
}
```

- [ ] **Step 3: Create devtools skill**

```markdown
// claude-devtools/skills/devtools/SKILL.md
---
name: devtools
description: >
  Open the Claude DevTools browser dashboard for visualizing session logs,
  agent execution flows, token/cost metrics, and sending commands.
  Trigger with "open devtools", "show dashboard", "session metrics",
  "agent flow", or "token usage".
---

# DevTools Dashboard

When triggered, use the `open-dashboard` MCP tool to launch the browser dashboard.

The dashboard shows:
- Agent execution flow (DAG visualization)
- Token usage and cost breakdown by model
- Tool call inventory with success/error rates
- Session timeline with expandable events
- Command input for sending prompts

The dashboard runs on localhost:3142 and auto-opens in the default browser.
```

- [ ] **Step 4: Create Makefile**

```makefile
// claude-devtools/Makefile
.PHONY: dev build package clean

# Install all dependencies
install:
	cd server && npm install
	cd dashboard && npm install

# Dev mode: watch server + dashboard
dev:
	cd server && npm run dev &
	cd dashboard && npm run dev &

# Build everything
build:
	cd server && npm run build
	cd dashboard && npm run build
	cp -r dashboard/dist server/dist/public

# Package as .plugin
package: build
	cd .. && zip -r claude-devtools.plugin claude-devtools/ \
		-x "claude-devtools/server/node_modules/*" \
		-x "claude-devtools/dashboard/node_modules/*" \
		-x "claude-devtools/server/src/*" \
		-x "claude-devtools/dashboard/src/*" \
		-x "claude-devtools/.git/*"

clean:
	rm -rf server/dist dashboard/dist
```

- [ ] **Step 5: Verify structure**

```bash
ls -la claude-devtools/.claude-plugin/plugin.json
ls -la claude-devtools/.mcp.json
ls -la claude-devtools/skills/devtools/SKILL.md
ls -la claude-devtools/Makefile
```

---

### Task 2: Initialize server project with TypeScript

**Files:**
- Create: `claude-devtools/server/package.json`
- Create: `claude-devtools/server/tsconfig.json`

- [ ] **Step 1: Create server package.json**

```json
{
  "name": "claude-devtools-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node18 --outdir=dist --format=esm --external:chokidar",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "express": "^4.18.0",
    "ws": "^8.16.0",
    "chokidar": "^3.6.0",
    "open": "^10.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "esbuild": "^0.20.0",
    "tsx": "^4.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd claude-devtools/server && npm install
```

Expected: Clean install, no errors.

---

### Task 3: Define TypeScript types

**Files:**
- Create: `claude-devtools/server/src/types.ts`

- [ ] **Step 1: Write all type definitions**

```typescript
// server/src/types.ts

// === JSONL Event Types ===

export interface BaseEvent {
  type: "queue-operation" | "user" | "assistant" | "progress";
  uuid: string;
  parentUuid?: string;
  timestamp: string;
  sessionId: string;
  isSidechain?: boolean;
  agentId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
}

export interface QueueOperationEvent extends BaseEvent {
  type: "queue-operation";
  operation: "enqueue" | "dequeue";
  content?: string;
}

export interface UserEvent extends BaseEvent {
  type: "user";
  message: {
    role: "user";
    content: ContentItem[];
  };
  userType: "external" | "internal";
  promptId?: string;
  sourceToolAssistantUUID?: string;
  toolUseResult?: Record<string, unknown>;
  permissionMode?: string;
}

export interface AssistantEvent extends BaseEvent {
  type: "assistant";
  requestId?: string;
  message: {
    role: "assistant";
    content: ContentItem[];
    model: string;
    id: string;
    type: "message";
    stop_reason: "end_turn" | "tool_use" | null;
    usage: TokenUsage;
  };
}

export interface ProgressEvent extends BaseEvent {
  type: "progress";
  data: {
    type: string;
    hookEvent?: string;
    hookName?: string;
    command?: string;
  };
  parentToolUseID?: string;
  toolUseID?: string;
}

export type SessionEvent =
  | QueueOperationEvent
  | UserEvent
  | AssistantEvent
  | ProgressEvent;

// === Content Types ===

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentItem =
  | TextContent
  | ThinkingContent
  | ToolUseContent
  | ToolResultContent;

// === Token Usage ===

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string;
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
  };
}

// === Analyzed Data ===

export interface SessionInfo {
  id: string;
  projectHash: string;
  path: string;
  startTime: string;
  lastModified: string;
  eventCount: number;
  subagentCount: number;
}

export interface AgentNode {
  id: string;
  type: string; // "main" | "Explore" | "Plan" | "general-purpose" | etc
  description?: string;
  parentId?: string;
  tokenUsage: AggregatedTokens;
  toolCalls: number;
  startTime?: string;
  endTime?: string;
}

export interface AgentEdge {
  source: string;
  target: string;
}

export interface AgentDAG {
  nodes: AgentNode[];
  edges: AgentEdge[];
}

export interface AggregatedTokens {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface ToolCallStat {
  name: string;
  count: number;
  errors: number;
  isMcp: boolean;
  mcpServer?: string;
}

export interface SessionMetrics {
  session: SessionInfo;
  dag: AgentDAG;
  tokens: AggregatedTokens;
  tokensByModel: Record<string, AggregatedTokens>;
  tokensByTurn: TurnTokens[];
  tools: ToolCallStat[];
  totalEvents: number;
  totalToolCalls: number;
  totalAgents: number;
  models: string[];
  duration: number; // ms
  permissionMode?: string;
}

export interface TurnTokens {
  index: number;
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  cost: number;
  cumulativeCost: number;
}

// === API Response Types ===

export interface SessionListResponse {
  sessions: SessionInfo[];
}

export interface SessionDetailResponse {
  metrics: SessionMetrics;
  events: SessionEvent[];
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd claude-devtools/server && npx tsc --noEmit src/types.ts
```

Expected: No errors.

---

### Task 4: Build JSONL parser

**Files:**
- Create: `claude-devtools/server/src/parser/jsonl-reader.ts`
- Create: `claude-devtools/server/src/parser/session-discovery.ts`

- [ ] **Step 1: Write JSONL reader**

```typescript
// server/src/parser/jsonl-reader.ts
import { readFileSync, existsSync } from "node:fs";
import type { SessionEvent } from "../types.js";

export function parseJsonlFile(filePath: string): SessionEvent[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const events: SessionEvent[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as SessionEvent;
      events.push(event);
    } catch {
      // Skip malformed lines — fail safe per architecture invariant
      continue;
    }
  }

  return events;
}

/**
 * Incremental reader: only parse lines after a given byte offset.
 * Returns new events + updated offset.
 */
export function parseJsonlIncremental(
  filePath: string,
  fromOffset: number
): { events: SessionEvent[]; newOffset: number } {
  if (!existsSync(filePath)) return { events: [], newOffset: fromOffset };

  const content = readFileSync(filePath, "utf-8");
  const newContent = content.slice(fromOffset);
  const events: SessionEvent[] = [];

  for (const line of newContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as SessionEvent);
    } catch {
      continue;
    }
  }

  return { events, newOffset: content.length };
}
```

- [ ] **Step 2: Write session discovery**

```typescript
// server/src/parser/session-discovery.ts
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SessionInfo } from "../types.js";
import { parseJsonlFile } from "./jsonl-reader.js";

function getClaudeProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

export function discoverSessions(): SessionInfo[] {
  const projectsDir = getClaudeProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const sessions: SessionInfo[] = [];

  for (const projectHash of readdirSync(projectsDir)) {
    const projectDir = join(projectsDir, projectHash);
    if (!statSync(projectDir).isDirectory()) continue;

    for (const file of readdirSync(projectDir)) {
      if (!file.endsWith(".jsonl")) continue;

      const sessionId = file.replace(".jsonl", "");
      const filePath = join(projectDir, file);
      const stat = statSync(filePath);

      // Count subagents
      const subagentDir = join(projectDir, sessionId, "subagents");
      let subagentCount = 0;
      if (existsSync(subagentDir)) {
        subagentCount = readdirSync(subagentDir).filter((f) =>
          f.endsWith(".jsonl")
        ).length;
      }

      // Count events (fast: count lines)
      const content = readFileSync(filePath, "utf-8");
      const eventCount = content.split("\n").filter((l) => l.trim()).length;

      // Get start time from first event
      const firstLine = content.split("\n").find((l) => l.trim());
      let startTime = stat.birthtime.toISOString();
      if (firstLine) {
        try {
          const first = JSON.parse(firstLine);
          if (first.timestamp) startTime = first.timestamp;
        } catch {
          // ignore
        }
      }

      sessions.push({
        id: sessionId,
        projectHash,
        path: filePath,
        startTime,
        lastModified: stat.mtime.toISOString(),
        eventCount,
        subagentCount,
      });
    }
  }

  // Sort by most recent first
  sessions.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  return sessions;
}

export function loadFullSession(sessionInfo: SessionInfo): {
  mainEvents: SessionEvent[];
  subagentEvents: Map<string, SessionEvent[]>;
  subagentMeta: Map<string, { agentType: string; description: string }>;
} {
  const mainEvents = parseJsonlFile(sessionInfo.path);

  const subagentEvents = new Map<string, SessionEvent[]>();
  const subagentMeta = new Map<
    string,
    { agentType: string; description: string }
  >();

  const subagentDir = join(
    getClaudeProjectsDir(),
    sessionInfo.projectHash,
    sessionInfo.id,
    "subagents"
  );

  if (existsSync(subagentDir)) {
    for (const file of readdirSync(subagentDir)) {
      if (file.endsWith(".jsonl")) {
        const agentId = file.replace(".jsonl", "").replace("agent-", "");
        subagentEvents.set(
          agentId,
          parseJsonlFile(join(subagentDir, file))
        );
      } else if (file.endsWith(".meta.json")) {
        const agentId = file
          .replace(".meta.json", "")
          .replace("agent-", "");
        try {
          const meta = JSON.parse(
            readFileSync(join(subagentDir, file), "utf-8")
          );
          subagentMeta.set(agentId, {
            agentType: meta.agentType || "unknown",
            description: meta.description || "",
          });
        } catch {
          // ignore
        }
      }
    }
  }

  return { mainEvents, subagentEvents, subagentMeta };
}
```

- [ ] **Step 3: Verify parser compiles**

```bash
cd claude-devtools/server && npx tsc --noEmit
```

Expected: No errors.

---

### Task 5: Build analyzers

**Files:**
- Create: `claude-devtools/server/src/analyzer/dag-builder.ts`
- Create: `claude-devtools/server/src/analyzer/metrics.ts`
- Create: `claude-devtools/server/src/analyzer/tool-stats.ts`

- [ ] **Step 1: Write DAG builder**

```typescript
// server/src/analyzer/dag-builder.ts
import type {
  SessionEvent,
  AgentDAG,
  AgentNode,
  AgentEdge,
  AssistantEvent,
  AggregatedTokens,
  ToolUseContent,
} from "../types.js";
import { calculateTokenCost } from "./metrics.js";

export function buildAgentDAG(
  mainEvents: SessionEvent[],
  subagentEvents: Map<string, SessionEvent[]>,
  subagentMeta: Map<string, { agentType: string; description: string }>
): AgentDAG {
  const nodes: AgentNode[] = [];
  const edges: AgentEdge[] = [];

  // Main session node
  const mainTokens = aggregateTokens(mainEvents);
  const mainToolCalls = countToolCalls(mainEvents);
  nodes.push({
    id: "main",
    type: "main",
    description: "Main session",
    tokenUsage: mainTokens,
    toolCalls: mainToolCalls,
    startTime: mainEvents[0]?.timestamp,
    endTime: mainEvents[mainEvents.length - 1]?.timestamp,
  });

  // Find Agent tool_use calls in main session to link parent→child
  for (const event of mainEvents) {
    if (event.type !== "assistant") continue;
    for (const content of event.message.content) {
      if (content.type === "tool_use" && content.name === "Agent") {
        const agentDesc =
          (content.input as Record<string, unknown>).description as string;
        // Try to match to a subagent by description
        for (const [agentId, meta] of subagentMeta) {
          if (meta.description === agentDesc) {
            edges.push({ source: "main", target: agentId });
          }
        }
      }
    }
  }

  // Subagent nodes
  for (const [agentId, events] of subagentEvents) {
    const meta = subagentMeta.get(agentId);
    const tokens = aggregateTokens(events);
    const toolCalls = countToolCalls(events);

    nodes.push({
      id: agentId,
      type: meta?.agentType || "unknown",
      description: meta?.description || agentId,
      parentId: "main", // default, refined by edges
      tokenUsage: tokens,
      toolCalls,
      startTime: events[0]?.timestamp,
      endTime: events[events.length - 1]?.timestamp,
    });

    // If no edge was created from main, add default
    if (!edges.find((e) => e.target === agentId)) {
      edges.push({ source: "main", target: agentId });
    }
  }

  return { nodes, edges };
}

function aggregateTokens(events: SessionEvent[]): AggregatedTokens {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;

  for (const event of events) {
    if (event.type !== "assistant") continue;
    const usage = event.message.usage;
    if (!usage) continue;

    inputTokens += usage.input_tokens || 0;
    outputTokens += usage.output_tokens || 0;
    cacheWriteTokens += usage.cache_creation_input_tokens || 0;
    cacheReadTokens += usage.cache_read_input_tokens || 0;
  }

  const totalCost = calculateTokenCost("claude-sonnet-4-6", {
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
  });

  return { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, totalCost };
}

function countToolCalls(events: SessionEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.type !== "assistant") continue;
    for (const content of event.message.content) {
      if (content.type === "tool_use") count++;
    }
  }
  return count;
}
```

- [ ] **Step 2: Write metrics aggregator**

```typescript
// server/src/analyzer/metrics.ts
import type {
  SessionEvent,
  SessionMetrics,
  SessionInfo,
  AggregatedTokens,
  TurnTokens,
  AssistantEvent,
} from "../types.js";
import { buildAgentDAG } from "./dag-builder.js";
import { buildToolStats } from "./tool-stats.js";

// Pricing per million tokens (March 2026)
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

export function calculateTokenCost(
  model: string,
  tokens: { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number }
): number {
  // Find matching pricing by prefix
  const pricing = Object.entries(MODEL_PRICING).find(([key]) =>
    model.includes(key.split("-").slice(0, -1).join("-")) || model.includes(key)
  )?.[1] || MODEL_PRICING["claude-sonnet-4-6"]; // default to sonnet

  return (
    (tokens.inputTokens * pricing.input) / 1_000_000 +
    (tokens.outputTokens * pricing.output) / 1_000_000 +
    (tokens.cacheWriteTokens * pricing.cacheWrite) / 1_000_000 +
    (tokens.cacheReadTokens * pricing.cacheRead) / 1_000_000
  );
}

export function computeMetrics(
  sessionInfo: SessionInfo,
  mainEvents: SessionEvent[],
  subagentEvents: Map<string, SessionEvent[]>,
  subagentMeta: Map<string, { agentType: string; description: string }>
): SessionMetrics {
  const allEvents = [
    ...mainEvents,
    ...Array.from(subagentEvents.values()).flat(),
  ];

  // Aggregate tokens
  const tokensByModel: Record<string, AggregatedTokens> = {};
  const tokensByTurn: TurnTokens[] = [];
  let totalTokens: AggregatedTokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0,
  };

  let turnIndex = 0;
  let cumulativeCost = 0;
  const models = new Set<string>();

  for (const event of allEvents) {
    if (event.type !== "assistant") continue;
    const usage = event.message.usage;
    const model = event.message.model || "unknown";
    if (!usage) continue;

    models.add(model);

    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const cost = calculateTokenCost(model, {
      inputTokens: input,
      outputTokens: output,
      cacheWriteTokens: cacheWrite,
      cacheReadTokens: cacheRead,
    });

    totalTokens.inputTokens += input;
    totalTokens.outputTokens += output;
    totalTokens.cacheWriteTokens += cacheWrite;
    totalTokens.cacheReadTokens += cacheRead;
    totalTokens.totalCost += cost;

    if (!tokensByModel[model]) {
      tokensByModel[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
      };
    }
    tokensByModel[model].inputTokens += input;
    tokensByModel[model].outputTokens += output;
    tokensByModel[model].cacheWriteTokens += cacheWrite;
    tokensByModel[model].cacheReadTokens += cacheRead;
    tokensByModel[model].totalCost += cost;

    cumulativeCost += cost;
    tokensByTurn.push({
      index: turnIndex++,
      timestamp: event.timestamp,
      model,
      inputTokens: input,
      outputTokens: output,
      cacheWriteTokens: cacheWrite,
      cacheReadTokens: cacheRead,
      cost,
      cumulativeCost,
    });
  }

  // Build DAG
  const dag = buildAgentDAG(mainEvents, subagentEvents, subagentMeta);

  // Tool stats
  const tools = buildToolStats(allEvents);

  // Count tool calls
  let totalToolCalls = 0;
  for (const t of tools) totalToolCalls += t.count;

  // Duration
  const timestamps = allEvents
    .map((e) => new Date(e.timestamp).getTime())
    .filter((t) => !isNaN(t));
  const duration =
    timestamps.length > 1
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : 0;

  return {
    session: sessionInfo,
    dag,
    tokens: totalTokens,
    tokensByModel,
    tokensByTurn,
    tools,
    totalEvents: allEvents.length,
    totalToolCalls,
    totalAgents: 1 + subagentEvents.size,
    models: Array.from(models),
    duration,
  };
}
```

- [ ] **Step 3: Write tool stats**

```typescript
// server/src/analyzer/tool-stats.ts
import type { SessionEvent, ToolCallStat } from "../types.js";

export function buildToolStats(events: SessionEvent[]): ToolCallStat[] {
  const stats = new Map<string, { count: number; errors: number }>();
  const toolUseIds = new Map<string, string>(); // tool_use_id → tool_name

  // Collect tool_use calls
  for (const event of events) {
    if (event.type !== "assistant") continue;
    for (const content of event.message.content) {
      if (content.type === "tool_use") {
        toolUseIds.set(content.id, content.name);
        const existing = stats.get(content.name) || { count: 0, errors: 0 };
        existing.count++;
        stats.set(content.name, existing);
      }
    }
  }

  // Match tool_results for error tracking
  for (const event of events) {
    if (event.type !== "user") continue;
    for (const content of event.message.content) {
      if (content.type === "tool_result" && content.is_error) {
        const toolName = toolUseIds.get(content.tool_use_id);
        if (toolName) {
          const existing = stats.get(toolName);
          if (existing) existing.errors++;
        }
      }
    }
  }

  // Convert to array with MCP detection
  return Array.from(stats.entries())
    .map(([name, { count, errors }]) => {
      const isMcp = name.startsWith("mcp__");
      const mcpServer = isMcp ? name.split("__")[1] : undefined;
      return { name, count, errors, isMcp, mcpServer };
    })
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Verify analyzers compile**

```bash
cd claude-devtools/server && npx tsc --noEmit
```

Expected: No errors.

---

## Chunk 2: HTTP Server + REST API

### Task 6: Build Express + WebSocket server

**Files:**
- Create: `claude-devtools/server/src/http/server.ts`
- Create: `claude-devtools/server/src/http/routes.ts`
- Create: `claude-devtools/server/src/http/watcher.ts`

- [ ] **Step 1: Write HTTP server**

```typescript
// server/src/http/server.ts
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { setupRoutes } from "./routes.js";
import { startWatcher } from "./watcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerState {
  clients: Set<WebSocket>;
}

export function startHttpServer(port: number = 3142): Promise<{
  url: string;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    const state: ServerState = { clients: new Set() };

    // WebSocket connections
    wss.on("connection", (ws) => {
      state.clients.add(ws);
      ws.on("close", () => state.clients.delete(ws));
    });

    // API routes
    app.use("/api", setupRoutes());

    // Serve React SPA (built dashboard)
    const publicDir = join(__dirname, "public");
    if (existsSync(publicDir)) {
      app.use(express.static(publicDir));
      // SPA fallback
      app.get("*", (_req, res) => {
        res.sendFile(join(publicDir, "index.html"));
      });
    }

    // Start file watcher
    startWatcher(state);

    // Try preferred port, fall back to random
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === 3142) {
        // Fallback to random port
        server.listen(0, () => {
          const addr = server.address();
          const actualPort = typeof addr === "object" ? addr?.port : 0;
          const url = `http://localhost:${actualPort}`;
          resolve({ url, close: () => server.close() });
        });
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      resolve({ url, close: () => server.close() });
    });
  });
}

export function broadcast(state: ServerState, data: unknown): void {
  const msg = JSON.stringify(data);
  for (const client of state.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
```

- [ ] **Step 2: Write REST API routes**

```typescript
// server/src/http/routes.ts
import { Router, json } from "express";
import { discoverSessions, loadFullSession } from "../parser/session-discovery.js";
import { computeMetrics } from "../analyzer/metrics.js";
import type { SessionInfo } from "../types.js";

export function setupRoutes(): Router {
  const router = Router();
  router.use(json());

  // List all sessions
  router.get("/sessions", (_req, res) => {
    try {
      const sessions = discoverSessions();
      res.json({ sessions });
    } catch (err) {
      res.status(500).json({ error: "Failed to discover sessions" });
    }
  });

  // Get session detail + metrics
  router.get("/sessions/:projectHash/:sessionId", (req, res) => {
    try {
      const { projectHash, sessionId } = req.params;
      const sessions = discoverSessions();
      const session = sessions.find(
        (s) => s.projectHash === projectHash && s.id === sessionId
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { mainEvents, subagentEvents, subagentMeta } =
        loadFullSession(session);
      const metrics = computeMetrics(
        session,
        mainEvents,
        subagentEvents,
        subagentMeta
      );

      res.json({ metrics, events: mainEvents });
    } catch (err) {
      res.status(500).json({ error: "Failed to load session" });
    }
  });

  // Command input (v1: simple prompt)
  router.post("/command", async (req, res) => {
    const { prompt, cwd } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    try {
      const { spawn } = await import("node:child_process");
      const child = spawn("claude", ["-p", prompt], {
        cwd: cwd || process.cwd(),
        env: { ...process.env },
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      child.stdout.on("data", (data: Buffer) => {
        res.write(`data: ${JSON.stringify({ type: "stdout", text: data.toString() })}\n\n`);
      });

      child.stderr.on("data", (data: Buffer) => {
        res.write(`data: ${JSON.stringify({ type: "stderr", text: data.toString() })}\n\n`);
      });

      child.on("close", (code) => {
        res.write(`data: ${JSON.stringify({ type: "done", exitCode: code })}\n\n`);
        res.end();
      });

      child.on("error", (err) => {
        res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
        res.end();
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to execute command" });
    }
  });

  return router;
}
```

- [ ] **Step 3: Write file watcher**

```typescript
// server/src/http/watcher.ts
import chokidar from "chokidar";
import { homedir } from "node:os";
import { join } from "node:path";
import { broadcast, type ServerState } from "./server.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";

const offsets = new Map<string, number>();

export function startWatcher(state: ServerState): void {
  const projectsDir = join(homedir(), ".claude", "projects");

  const watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  watcher.on("change", (filePath) => {
    const currentOffset = offsets.get(filePath) || 0;
    const { events, newOffset } = parseJsonlIncremental(
      filePath,
      currentOffset
    );
    offsets.set(filePath, newOffset);

    if (events.length > 0) {
      broadcast(state, {
        type: "new-events",
        filePath,
        events,
      });
    }
  });

  watcher.on("add", (filePath) => {
    broadcast(state, {
      type: "new-session",
      filePath,
    });
  });
}
```

- [ ] **Step 4: Verify server compiles**

```bash
cd claude-devtools/server && npx tsc --noEmit
```

Expected: No errors.

---

### Task 7: Build MCP server entry point

**Files:**
- Create: `claude-devtools/server/src/index.ts`
- Create: `claude-devtools/server/src/tools/open-dashboard.ts`
- Create: `claude-devtools/server/src/tools/session-list.ts`

- [ ] **Step 1: Write MCP tool definitions**

```typescript
// server/src/tools/open-dashboard.ts
import open from "open";
import { startHttpServer } from "../http/server.js";

let serverInstance: { url: string; close: () => void } | null = null;

export async function openDashboard(): Promise<string> {
  if (!serverInstance) {
    const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);
    serverInstance = await startHttpServer(port);
  }

  await open(serverInstance.url);
  return `Dashboard opened at ${serverInstance.url}`;
}

export function getDashboardUrl(): string | null {
  return serverInstance?.url || null;
}
```

```typescript
// server/src/tools/session-list.ts
import { discoverSessions } from "../parser/session-discovery.js";

export function listSessions(): string {
  const sessions = discoverSessions();

  if (sessions.length === 0) {
    return "No Claude Code sessions found in ~/.claude/projects/";
  }

  const lines = sessions.slice(0, 20).map((s, i) => {
    const date = new Date(s.lastModified).toLocaleString();
    return `${i + 1}. [${s.projectHash}] ${s.id} — ${s.eventCount} events, ${s.subagentCount} subagents (${date})`;
  });

  return `Found ${sessions.length} sessions:\n\n${lines.join("\n")}`;
}
```

- [ ] **Step 2: Write MCP server entry**

```typescript
// server/src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { openDashboard } from "./tools/open-dashboard.js";
import { listSessions } from "./tools/session-list.js";

const server = new Server(
  { name: "claude-devtools", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "open-dashboard",
      description:
        "Open the Claude DevTools dashboard in the browser. Shows agent flow visualization, token/cost metrics, tool usage stats, and session timeline.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "list-sessions",
      description:
        "List recent Claude Code sessions with event counts and metadata.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Max sessions to return (default 20)",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  switch (name) {
    case "open-dashboard": {
      const result = await openDashboard();
      return { content: [{ type: "text" as const, text: result }] };
    }
    case "list-sessions": {
      const result = listSessions();
      return { content: [{ type: "text" as const, text: result }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude DevTools MCP server running");
}

main().catch(console.error);
```

- [ ] **Step 3: Build the server**

```bash
cd claude-devtools/server && npm run build
```

Expected: `dist/index.js` created, no errors.

- [ ] **Step 4: Commit chunk 2**

```bash
git add -A && git commit -m "feat: add HTTP/WS server and MCP entry point"
```

---

## Chunk 3: React Dashboard

### Task 8: Initialize React dashboard project

**Files:**
- Create: `claude-devtools/dashboard/package.json`
- Create: `claude-devtools/dashboard/index.html`
- Create: `claude-devtools/dashboard/vite.config.ts`
- Create: `claude-devtools/dashboard/tailwind.config.js`
- Create: `claude-devtools/dashboard/postcss.config.js`
- Create: `claude-devtools/dashboard/src/styles/globals.css`
- Create: `claude-devtools/dashboard/src/main.tsx`

- [ ] **Step 1: Create dashboard package.json**

```json
{
  "name": "claude-devtools-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@xyflow/react": "^12.0.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.1.0"
  }
}
```

- [ ] **Step 2: Create Vite config + Tailwind + PostCSS + HTML entry**

```typescript
// dashboard/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3142",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

```javascript
// dashboard/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

```javascript
// dashboard/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

```html
<!-- dashboard/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude DevTools</title>
  </head>
  <body class="bg-gray-950 text-gray-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```css
/* dashboard/src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```tsx
// dashboard/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Install dependencies**

```bash
cd claude-devtools/dashboard && npm install
```

- [ ] **Step 4: Verify Vite dev server starts**

```bash
cd claude-devtools/dashboard && npx vite --port 5173 &
# Wait 3s, then curl
curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML with `<div id="root">`.

---

### Task 9: Build shared types and hooks

**Files:**
- Create: `claude-devtools/dashboard/src/lib/types.ts`
- Create: `claude-devtools/dashboard/src/lib/cost.ts`
- Create: `claude-devtools/dashboard/src/hooks/useWebSocket.ts`
- Create: `claude-devtools/dashboard/src/hooks/useSessionData.ts`

- [ ] **Step 1: Write frontend types**

```typescript
// dashboard/src/lib/types.ts
// Mirrors server types — shared via API responses

export interface SessionInfo {
  id: string;
  projectHash: string;
  path: string;
  startTime: string;
  lastModified: string;
  eventCount: number;
  subagentCount: number;
}

export interface AgentNode {
  id: string;
  type: string;
  description?: string;
  parentId?: string;
  tokenUsage: AggregatedTokens;
  toolCalls: number;
  startTime?: string;
  endTime?: string;
}

export interface AgentEdge {
  source: string;
  target: string;
}

export interface AgentDAG {
  nodes: AgentNode[];
  edges: AgentEdge[];
}

export interface AggregatedTokens {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface ToolCallStat {
  name: string;
  count: number;
  errors: number;
  isMcp: boolean;
  mcpServer?: string;
}

export interface TurnTokens {
  index: number;
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  cost: number;
  cumulativeCost: number;
}

export interface SessionMetrics {
  session: SessionInfo;
  dag: AgentDAG;
  tokens: AggregatedTokens;
  tokensByModel: Record<string, AggregatedTokens>;
  tokensByTurn: TurnTokens[];
  tools: ToolCallStat[];
  totalEvents: number;
  totalToolCalls: number;
  totalAgents: number;
  models: string[];
  duration: number;
  permissionMode?: string;
}
```

- [ ] **Step 2: Write cost calculator**

```typescript
// dashboard/src/lib/cost.ts
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
```

- [ ] **Step 3: Write WebSocket hook**

```typescript
// dashboard/src/hooks/useWebSocket.ts
import { useState, useEffect, useRef, useCallback } from "react";

interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export function useWebSocket(url: string) {
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2s
      setTimeout(() => {
        wsRef.current = new WebSocket(url);
      }, 2000);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, data]);
      } catch {
        // ignore
      }
    };

    return () => ws.close();
  }, [url]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, connected, clearMessages };
}
```

- [ ] **Step 4: Write session data hook**

```typescript
// dashboard/src/hooks/useSessionData.ts
import { useState, useEffect } from "react";
import type { SessionInfo, SessionMetrics } from "../lib/types";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { sessions, loading };
}

export function useSessionMetrics(
  projectHash: string | null,
  sessionId: string | null
) {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectHash || !sessionId) return;
    setLoading(true);

    fetch(`/api/sessions/${projectHash}/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data.metrics || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectHash, sessionId]);

  return { metrics, loading };
}
```

---

### Task 10: Build dashboard components

**Files:**
- Create: `claude-devtools/dashboard/src/App.tsx`
- Create: `claude-devtools/dashboard/src/components/Layout.tsx`
- Create: `claude-devtools/dashboard/src/components/SessionSelector.tsx`
- Create: `claude-devtools/dashboard/src/components/SummaryCards.tsx`
- Create: `claude-devtools/dashboard/src/components/AgentFlowDAG.tsx`
- Create: `claude-devtools/dashboard/src/components/TokenChart.tsx`
- Create: `claude-devtools/dashboard/src/components/ToolStats.tsx`
- Create: `claude-devtools/dashboard/src/components/CommandInput.tsx`

- [ ] **Step 1: Write App.tsx (root component + state management)**

```tsx
// dashboard/src/App.tsx
import { useState } from "react";
import { Layout } from "./components/Layout";
import { SessionSelector } from "./components/SessionSelector";
import { SummaryCards } from "./components/SummaryCards";
import { AgentFlowDAG } from "./components/AgentFlowDAG";
import { TokenChart } from "./components/TokenChart";
import { ToolStats } from "./components/ToolStats";
import { CommandInput } from "./components/CommandInput";
import { useSessions, useSessionMetrics } from "./hooks/useSessionData";

export default function App() {
  const { sessions, loading: sessionsLoading } = useSessions();
  const [selected, setSelected] = useState<{
    projectHash: string;
    sessionId: string;
  } | null>(null);

  const { metrics, loading: metricsLoading } = useSessionMetrics(
    selected?.projectHash ?? null,
    selected?.sessionId ?? null
  );

  const [activeTab, setActiveTab] = useState<
    "flow" | "tokens" | "tools" | "command"
  >("flow");

  return (
    <Layout
      sidebar={
        <SessionSelector
          sessions={sessions}
          loading={sessionsLoading}
          selected={selected}
          onSelect={setSelected}
        />
      }
    >
      {!selected ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Claude DevTools</h2>
            <p>Select a session from the sidebar to begin</p>
          </div>
        </div>
      ) : metricsLoading ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          Loading session...
        </div>
      ) : metrics ? (
        <div className="flex flex-col h-full">
          <SummaryCards metrics={metrics} />

          {/* Tab bar */}
          <div className="flex gap-1 px-4 pt-2 border-b border-gray-800">
            {(
              [
                ["flow", "Agent Flow"],
                ["tokens", "Tokens & Cost"],
                ["tools", "Tools"],
                ["command", "Command"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm rounded-t-lg transition ${
                  activeTab === key
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === "flow" && <AgentFlowDAG dag={metrics.dag} />}
            {activeTab === "tokens" && <TokenChart metrics={metrics} />}
            {activeTab === "tools" && <ToolStats tools={metrics.tools} />}
            {activeTab === "command" && <CommandInput />}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-red-400">
          Failed to load session
        </div>
      )}
    </Layout>
  );
}
```

- [ ] **Step 2: Write Layout + SessionSelector**

```tsx
// dashboard/src/components/Layout.tsx
import { ReactNode } from "react";

export function Layout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-950">
      <aside className="w-72 border-r border-gray-800 overflow-y-auto">
        {sidebar}
      </aside>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
```

```tsx
// dashboard/src/components/SessionSelector.tsx
import type { SessionInfo } from "../lib/types";

interface Props {
  sessions: SessionInfo[];
  loading: boolean;
  selected: { projectHash: string; sessionId: string } | null;
  onSelect: (s: { projectHash: string; sessionId: string }) => void;
}

export function SessionSelector({ sessions, loading, selected, onSelect }: Props) {
  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-white mb-4">Claude DevTools</h1>
      <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
        Sessions
      </h2>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No sessions found</p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((s) => {
            const isActive =
              selected?.projectHash === s.projectHash &&
              selected?.sessionId === s.id;
            return (
              <li key={`${s.projectHash}/${s.id}`}>
                <button
                  onClick={() =>
                    onSelect({ projectHash: s.projectHash, sessionId: s.id })
                  }
                  className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                    isActive
                      ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <div className="font-mono text-xs truncate">
                    {s.id.slice(0, 8)}...
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s.eventCount} events · {s.subagentCount} agents
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(s.lastModified).toLocaleString()}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write SummaryCards**

```tsx
// dashboard/src/components/SummaryCards.tsx
import type { SessionMetrics } from "../lib/types";
import { formatCost, formatTokens, formatDuration } from "../lib/cost";

export function SummaryCards({ metrics }: { metrics: SessionMetrics }) {
  const cards = [
    {
      label: "Total Cost",
      value: formatCost(metrics.tokens.totalCost),
      sub: metrics.models.join(", "),
    },
    {
      label: "Tokens",
      value: formatTokens(
        metrics.tokens.inputTokens + metrics.tokens.outputTokens
      ),
      sub: `In: ${formatTokens(metrics.tokens.inputTokens)} / Out: ${formatTokens(metrics.tokens.outputTokens)}`,
    },
    {
      label: "Cache Hit",
      value:
        metrics.tokens.inputTokens > 0
          ? `${Math.round((metrics.tokens.cacheReadTokens / (metrics.tokens.inputTokens + metrics.tokens.cacheReadTokens)) * 100)}%`
          : "N/A",
      sub: `${formatTokens(metrics.tokens.cacheReadTokens)} cached`,
    },
    {
      label: "Duration",
      value: formatDuration(metrics.duration),
      sub: `${metrics.totalEvents} events`,
    },
    {
      label: "Agents",
      value: metrics.totalAgents.toString(),
      sub: `${metrics.totalToolCalls} tool calls`,
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-3 p-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-gray-900 border border-gray-800 rounded-lg p-3"
        >
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            {card.label}
          </div>
          <div className="text-xl font-bold text-white mt-1">{card.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write AgentFlowDAG**

```tsx
// dashboard/src/components/AgentFlowDAG.tsx
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentDAG } from "../lib/types";
import { formatCost, formatTokens } from "../lib/cost";

const typeColors: Record<string, string> = {
  main: "#3b82f6",
  Explore: "#06b6d4",
  Plan: "#eab308",
  "general-purpose": "#8b5cf6",
  unknown: "#6b7280",
};

export function AgentFlowDAG({ dag }: { dag: AgentDAG }) {
  const nodes: Node[] = dag.nodes.map((n, i) => ({
    id: n.id,
    position: {
      x: n.id === "main" ? 300 : 150 + (i - 1) * 300,
      y: n.id === "main" ? 50 : 250,
    },
    data: {
      label: (
        <div className="text-left">
          <div className="font-bold text-sm">{n.type}</div>
          <div className="text-xs opacity-70 truncate max-w-48">
            {n.description}
          </div>
          <div className="text-xs mt-1 opacity-60">
            {formatTokens(n.tokenUsage.inputTokens + n.tokenUsage.outputTokens)}{" "}
            tokens · {formatCost(n.tokenUsage.totalCost)}
          </div>
          <div className="text-xs opacity-60">{n.toolCalls} tool calls</div>
        </div>
      ),
    },
    style: {
      background: "#1f2937",
      border: `2px solid ${typeColors[n.type] || typeColors.unknown}`,
      borderRadius: "8px",
      padding: "12px",
      color: "white",
      minWidth: "200px",
    },
  }));

  const edges: Edge[] = dag.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: "#4b5563" },
  }));

  return (
    <div className="h-full w-full" style={{ minHeight: "500px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#374151" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 5: Write TokenChart**

```tsx
// dashboard/src/components/TokenChart.tsx
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { SessionMetrics } from "../lib/types";
import { formatCost, formatTokens } from "../lib/cost";

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#eab308"];

export function TokenChart({ metrics }: { metrics: SessionMetrics }) {
  const turnData = metrics.tokensByTurn.map((t) => ({
    turn: t.index,
    input: t.inputTokens,
    output: t.outputTokens,
    cacheRead: t.cacheReadTokens,
    cumulativeCost: t.cumulativeCost,
  }));

  const modelData = Object.entries(metrics.tokensByModel).map(
    ([model, tokens]) => ({
      name: model.replace("claude-", "").split("-").slice(0, 2).join("-"),
      value: tokens.totalCost,
    })
  );

  return (
    <div className="space-y-6">
      {/* Cumulative cost over turns */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Cumulative Cost Over Time
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={turnData}>
            <XAxis dataKey="turn" stroke="#6b7280" />
            <YAxis
              stroke="#6b7280"
              tickFormatter={(v: number) => formatCost(v)}
            />
            <Tooltip
              contentStyle={{ background: "#1f2937", border: "none" }}
              formatter={(v: number) => formatCost(v)}
            />
            <Area
              type="monotone"
              dataKey="cumulativeCost"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Token usage per turn */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Tokens Per Turn
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={turnData}>
            <XAxis dataKey="turn" stroke="#6b7280" />
            <YAxis
              stroke="#6b7280"
              tickFormatter={(v: number) => formatTokens(v)}
            />
            <Tooltip
              contentStyle={{ background: "#1f2937", border: "none" }}
              formatter={(v: number) => formatTokens(v)}
            />
            <Area
              type="monotone"
              dataKey="input"
              stackId="1"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
              name="Input"
            />
            <Area
              type="monotone"
              dataKey="output"
              stackId="1"
              stroke="#8b5cf6"
              fill="#8b5cf6"
              fillOpacity={0.3}
              name="Output"
            />
            <Area
              type="monotone"
              dataKey="cacheRead"
              stackId="1"
              stroke="#06b6d4"
              fill="#06b6d4"
              fillOpacity={0.3}
              name="Cache Read"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Cost by model */}
      {modelData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            Cost by Model
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={modelData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, value }: { name: string; value: number }) =>
                  `${name}: ${formatCost(value)}`
                }
              >
                {modelData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write ToolStats**

```tsx
// dashboard/src/components/ToolStats.tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ToolCallStat } from "../lib/types";

export function ToolStats({ tools }: { tools: ToolCallStat[] }) {
  const barData = tools.slice(0, 15).map((t) => ({
    name: t.isMcp ? `${t.mcpServer}/${t.name.split("__").pop()}` : t.name,
    count: t.count,
    errors: t.errors,
    isMcp: t.isMcp,
  }));

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Tool Usage (Top 15)
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={barData} layout="vertical">
            <XAxis type="number" stroke="#6b7280" />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#6b7280"
              width={200}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{ background: "#1f2937", border: "none" }}
            />
            <Bar dataKey="count" name="Calls">
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.isMcp ? "#06b6d4" : "#3b82f6"}
                />
              ))}
            </Bar>
            <Bar dataKey="errors" name="Errors" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          All Tools
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 px-3">Tool</th>
              <th className="text-right py-2 px-3">Calls</th>
              <th className="text-right py-2 px-3">Errors</th>
              <th className="text-right py-2 px-3">Error Rate</th>
              <th className="text-left py-2 px-3">Type</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t) => (
              <tr key={t.name} className="border-b border-gray-800/50">
                <td className="py-2 px-3 font-mono text-xs">{t.name}</td>
                <td className="py-2 px-3 text-right">{t.count}</td>
                <td className="py-2 px-3 text-right text-red-400">
                  {t.errors || "-"}
                </td>
                <td className="py-2 px-3 text-right">
                  {t.count > 0
                    ? `${Math.round((t.errors / t.count) * 100)}%`
                    : "-"}
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      t.isMcp
                        ? "bg-cyan-900/30 text-cyan-400"
                        : "bg-blue-900/30 text-blue-400"
                    }`}
                  >
                    {t.isMcp ? `MCP (${t.mcpServer})` : "Built-in"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write CommandInput**

```tsx
// dashboard/src/components/CommandInput.tsx
import { useState, useRef } from "react";

export function CommandInput() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || running) return;

    setRunning(true);
    setOutput([]);

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "stdout" || data.type === "stderr") {
              setOutput((prev) => [...prev, data.text]);
              outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      setOutput((prev) => [
        ...prev,
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      ]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-y-auto whitespace-pre-wrap border border-gray-800"
      >
        {output.length === 0 ? (
          <span className="text-gray-600">
            Send a prompt to Claude Code...
          </span>
        ) : (
          output.map((line, i) => <span key={i}>{line}</span>)
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a prompt..."
          disabled={running}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={running || !prompt.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? "Running..." : "Send"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Verify dashboard builds**

```bash
cd claude-devtools/dashboard && npx vite build
```

Expected: `dist/` directory created with index.html + bundled JS/CSS.

- [ ] **Step 9: Commit chunk 3**

```bash
git add -A && git commit -m "feat: add React dashboard with agent flow, token charts, tool stats, command input"
```

---

## Chunk 4: Integration + Packaging

### Task 11: Build the full plugin and test

- [ ] **Step 1: Build server + dashboard**

```bash
cd claude-devtools && make build
```

Expected: `server/dist/index.js` exists, `server/dist/public/index.html` exists.

- [ ] **Step 2: Test MCP server starts**

```bash
cd claude-devtools/server && echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js 2>/dev/null | head -1
```

Expected: JSON response with server capabilities.

- [ ] **Step 3: Package as .plugin**

```bash
cd claude-devtools && make package
ls -la ../claude-devtools.plugin
```

Expected: `.plugin` file created.

- [ ] **Step 4: Write README**

Create `claude-devtools/README.md` with installation and usage instructions.

- [ ] **Step 5: Final verification**

```bash
# Verify all files exist
ls claude-devtools/.claude-plugin/plugin.json
ls claude-devtools/.mcp.json
ls claude-devtools/skills/devtools/SKILL.md
ls claude-devtools/server/dist/index.js
ls claude-devtools/server/dist/public/index.html
```

Expected: All files present.

---

## Verification Checklist

- [ ] Plugin manifest is valid JSON with correct name/version
- [ ] MCP server starts without errors
- [ ] Dashboard builds without errors
- [ ] REST API returns session list
- [ ] REST API returns session metrics
- [ ] Agent DAG renders correctly
- [ ] Token charts display data
- [ ] Tool stats table populates
- [ ] Command input sends and streams response
- [ ] File watcher detects JSONL changes
- [ ] Plugin packages into .plugin file
