# Event Model — JSONL + SDK Streaming

Two event systems coexist. Understanding both is critical.

---

## JSONL Events (Disk Persistence)

Written by Claude Code to `~/.claude/projects/{hash}/{sessionId}.jsonl`. One JSON object per line.

### Event Types

| Type | Role | When |
|------|------|------|
| `user` (external) | Human prompt | User sends a message |
| `user` (internal) | Tool result | After tool execution |
| `assistant` | Claude response | Claude responds with text/tool_use |
| `system` | Metadata | Turn boundaries, init, compact, status |
| `progress` | Progress | Hook execution, tool progress |
| `queue-operation` | Queue | Prompt queuing (enqueue/dequeue) |

### BaseEvent (Common Fields)

```typescript
{
  type: "user" | "assistant" | "system" | "progress" | "queue-operation";
  uuid: string;
  parentUuid?: string;
  timestamp: string;           // ISO 8601
  sessionId: string;
  isSidechain?: boolean;       // true = subagent event
  agentId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
}
```

### Turn Detection

A new turn starts when: `type === "user" && userType === "external" && !isSidechain && has text content`

### Content Block Types

```typescript
// Text (in both user and assistant)
{ type: "text", text: string }

// Extended thinking (assistant only)
{ type: "thinking", thinking: string, signature?: string }

// Tool invocation (assistant only, stop_reason === "tool_use")
{ type: "tool_use", id: string, name: string, input: Record<string, unknown> }

// Tool result (user/internal only)
{ type: "tool_result", tool_use_id: string, content: string | unknown[], is_error?: boolean }
```

### Token Usage (on assistant events)

```typescript
message.usage: {
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
```

### System Event Subtypes

| Subtype | Data | Use |
|---------|------|-----|
| `turn_duration` | `durationMs: number` | Marks turn end (our primary turn completion signal) |
| `init` | tools, model, mcp_servers, agents, skills, plugins | Session initialization |
| `compact_boundary` | `compact_metadata.trigger`, `pre_tokens` | Context compaction occurred |
| `status` | status string | Status change (e.g., "compacting") |
| `custom-title` | `customTitle: string` | Session renamed |
| `task_started` | taskId, description | Background task started |
| `task_progress` | taskId, tokens, tools, duration | Task progress |
| `task_notification` | taskId, status, result | Task completed/failed |

---

## SDK Stream Events (Real-time)

From iterating `query()`. The `SDKMessage` union:

### Messages We MUST Forward via SSE

| SDK Type | `type` field | What It Contains | Our SSE Status |
|----------|-------------|------------------|----------------|
| `SDKPartialAssistantMessage` | `stream_event` | Content block deltas (text, thinking, tool_use) | **PARTIAL** — only text_delta |
| `SDKAssistantMessage` | `assistant` | Complete response + usage | **PARTIAL** — only text blocks |
| `SDKUserMessage` | `user` | Tool results | **DROPPED** |
| `SDKResultMessage` | `result` | Final result (cost, usage, errors) | **PARTIAL** — only is_error |

### Messages We SHOULD Forward

| SDK Type | Subtype | What It Contains | Priority |
|----------|---------|------------------|----------|
| `SDKToolProgressMessage` | `tool_progress` | Tool execution elapsed time | P1 |
| `SDKToolUseSummaryMessage` | `tool_use_summary` | Summary of tool calls | P1 |
| `SDKSystemMessage` | `init` | Available tools, models, MCP, agents | P2 |
| `SDKStatusMessage` | `status` | "compacting", "thinking", etc. | P2 |
| `SDKCompactBoundaryMessage` | `compact_boundary` | Compaction occurred | P2 |
| `SDKRateLimitEvent` | `rate_limit_event` | Rate limit changes | P2 |
| `SDKPromptSuggestionMessage` | `prompt_suggestion` | Predicted next prompt | P3 |
| `SDKTaskStartedMessage` | `task_started` | Background task started | P2 |
| `SDKTaskProgressMessage` | `task_progress` | Task progress | P2 |
| `SDKTaskNotificationMessage` | `task_notification` | Task completed/failed | P2 |
| `SDKHookStartedMessage` | `hook_started` | Hook execution started | P3 |
| `SDKHookProgressMessage` | `hook_progress` | Hook output | P3 |
| `SDKHookResponseMessage` | `hook_response` | Hook completed | P3 |
| `SDKLocalCommandOutputMessage` | `local_command_output` | Slash command output | P2 |

### stream_event Detail

When `includePartialMessages: true`, we get `stream_event` messages containing Anthropic API streaming events:

```typescript
// Text streaming
{ type: "content_block_delta", delta: { type: "text_delta", text: "..." } }

// Thinking streaming
{ type: "content_block_delta", delta: { type: "thinking_delta", thinking: "..." } }

// Tool use streaming (name + input appear incrementally)
{ type: "content_block_start", content_block: { type: "tool_use", id: "...", name: "Read" } }
{ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "..." } }
{ type: "content_block_stop" }

// Message start/stop
{ type: "message_start", message: { ... } }
{ type: "message_delta", delta: { stop_reason: "..." }, usage: { ... } }
{ type: "message_stop" }
```

**Key insight:** `content_block_start` with `tool_use` type tells us Claude is about to call a tool. This is the event we need to show "Claude is calling Read..." in the UI. We currently drop it.

---

## Dual Data Path

For sessions started from the web UI, events flow through BOTH paths simultaneously:

```
SDK query() iterator ──→ SSE to dashboard (real-time, <50ms)
         │
         └──→ Claude Code writes .jsonl ──→ Watcher ──→ WS broadcast (~200ms)
```

The dashboard currently gets tool call info from the WS path (200ms delay from JSONL) but NOT from the SSE path (which only sends text). Fixing the SSE handler eliminates this delay.

---

## Subagent Events

Subagents write to separate JSONL files:
```
{sessionId}/subagents/agent-{agentId}.jsonl
{sessionId}/subagents/agent-{agentId}.meta.json
```

Main session events from subagents have `isSidechain: true` and `agentId` set. The meta.json contains `{ agentType, description }`.

Agent relationships are tracked by `tool_use` content blocks with `name: "Agent"` in assistant events. The `parent_tool_use_id` links child events to the spawning tool call.
