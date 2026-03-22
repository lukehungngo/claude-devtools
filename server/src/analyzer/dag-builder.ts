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
