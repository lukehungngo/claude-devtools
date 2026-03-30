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
import { normalizeContent } from "../lib/normalizeContent.js";

const ACTIVE_THRESHOLD_MS = 30_000; // 30 seconds

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
  const mainMcpCalls = countMcpToolCalls(mainEvents);
  const mainStatus = determineAgentStatus(mainEvents);
  nodes.push({
    id: "main",
    type: "main",
    description: "Main session",
    tokenUsage: mainTokens,
    toolCalls: mainToolCalls,
    mcpToolCalls: mainMcpCalls,
    status: mainStatus,
    startTime: mainEvents[0]?.timestamp,
    endTime: mainEvents[mainEvents.length - 1]?.timestamp,
  });

  // Find Agent tool_use calls in main session to link parent→child
  const edgeTargets = new Set<string>();
  for (const event of mainEvents) {
    if (event.type !== "assistant") continue;
    for (const content of normalizeContent(event.message.content)) {
      if (content.type === "tool_use" && content.name === "Agent") {
        const agentDesc =
          (content.input as Record<string, unknown>).description as string;
        // Try to match to a subagent by description
        for (const [agentId, meta] of subagentMeta) {
          if (meta.description === agentDesc && !edgeTargets.has(agentId)) {
            edgeTargets.add(agentId);
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
    const mcpCalls = countMcpToolCalls(events);
    const status = determineAgentStatus(events);

    nodes.push({
      id: agentId,
      type: meta?.agentType || "unknown",
      description: meta?.description || agentId,
      parentId: "main",
      tokenUsage: tokens,
      toolCalls,
      mcpToolCalls: mcpCalls,
      status,
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

function determineAgentStatus(
  events: SessionEvent[]
): "active" | "completed" | "error" {
  if (events.length === 0) return "completed";

  const lastEvent = events[events.length - 1];
  const lastTimestamp = new Date(lastEvent.timestamp).getTime();
  const isRecent = Date.now() - lastTimestamp < ACTIVE_THRESHOLD_MS;

  // Check if last tool_result has error (tool_result items are in user events)
  for (let i = events.length - 1; i >= Math.max(0, events.length - 3); i--) {
    const evt = events[i];
    if (evt.type === "user") {
      for (const content of normalizeContent(evt.message.content)) {
        if (content.type === "tool_result" && content.is_error) {
          return "error";
        }
      }
    }
  }

  if (isRecent) return "active";
  return "completed";
}

export function aggregateTokens(events: SessionEvent[]): AggregatedTokens {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;
  let totalCost = 0;

  for (const event of events) {
    if (event.type !== "assistant") continue;
    const usage = event.message.usage;
    if (!usage) continue;

    const evtIn = usage.input_tokens || 0;
    const evtOut = usage.output_tokens || 0;
    const evtCacheWrite = usage.cache_creation_input_tokens || 0;
    const evtCacheRead = usage.cache_read_input_tokens || 0;

    inputTokens += evtIn;
    outputTokens += evtOut;
    cacheWriteTokens += evtCacheWrite;
    cacheReadTokens += evtCacheRead;

    // Use the actual model from the event for accurate per-model pricing
    const model = event.message.model || "claude-sonnet-4-6";
    totalCost += calculateTokenCost(model, {
      inputTokens: evtIn,
      outputTokens: evtOut,
      cacheWriteTokens: evtCacheWrite,
      cacheReadTokens: evtCacheRead,
    });
  }

  return {
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    totalCost,
  };
}

function countToolCalls(events: SessionEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.type !== "assistant") continue;
    for (const content of normalizeContent(event.message.content)) {
      if (content.type === "tool_use") count++;
    }
  }
  return count;
}

function countMcpToolCalls(events: SessionEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.type !== "assistant") continue;
    for (const content of normalizeContent(event.message.content)) {
      if (content.type === "tool_use" && content.name.startsWith("mcp__")) {
        count++;
      }
    }
  }
  return count;
}
