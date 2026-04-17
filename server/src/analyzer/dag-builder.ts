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

/**
 * Analyze a list of events in a single pass, returning:
 * - token aggregation
 * - tool call count
 * - MCP tool call count
 * - agent status (active/completed/error)
 * - Agent tool_use descriptions found (for edge detection)
 */
function analyzeEvents(events: SessionEvent[], opts?: { isSubagent?: boolean }): {
  tokens: AggregatedTokens;
  toolCalls: number;
  mcpToolCalls: number;
  status: "active" | "completed" | "error";
  agentDescriptions: string[];
  model?: string;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;
  let totalCost = 0;
  let toolCalls = 0;
  let mcpToolCalls = 0;
  let lastModel: string | undefined;
  const agentDescriptions: string[] = [];

  // For status detection: track last few events for error check
  let hasRecentError = false;
  let isRecent = false;

  for (const event of events) {
    if (event.type === "assistant") {
      const usage = event.message.usage;
      if (usage) {
        const evtIn = usage.input_tokens || 0;
        const evtOut = usage.output_tokens || 0;
        const evtCacheWrite = usage.cache_creation_input_tokens || 0;
        const evtCacheRead = usage.cache_read_input_tokens || 0;

        inputTokens += evtIn;
        outputTokens += evtOut;
        cacheWriteTokens += evtCacheWrite;
        cacheReadTokens += evtCacheRead;

        const rawModel = event.message.model;
        const model = rawModel || "claude-sonnet-4-6";
        if (rawModel && !rawModel.startsWith("<")) lastModel = rawModel;
        totalCost += calculateTokenCost(model, {
          inputTokens: evtIn,
          outputTokens: evtOut,
          cacheWriteTokens: evtCacheWrite,
          cacheReadTokens: evtCacheRead,
        });
      }

      for (const content of normalizeContent(event.message.content)) {
        if (content.type === "tool_use") {
          toolCalls++;
          if (content.name.startsWith("mcp__")) {
            mcpToolCalls++;
          }
          if (content.name === "Agent" || content.name === "Task") {
            const desc = (content.input as Record<string, unknown>).description as string;
            if (desc) agentDescriptions.push(desc);
          }
        }
      }
    }
  }

  // Determine status: check last assistant event for definitive completion,
  // then fall back to time-based heuristic
  let hasEndTurn = false;
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    const lastTimestamp = new Date(lastEvent.timestamp).getTime();
    isRecent = Date.now() - lastTimestamp < ACTIVE_THRESHOLD_MS;

    // Check last assistant event for stop_reason — definitive completion signal
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "assistant") {
        const asst = events[i] as AssistantEvent;
        if (asst.message?.stop_reason === "end_turn") {
          hasEndTurn = true;
        }
        break;
      }
    }

    for (let i = events.length - 1; i >= Math.max(0, events.length - 3); i--) {
      const evt = events[i];
      if (evt.type === "user") {
        for (const content of normalizeContent(evt.message.content)) {
          if (content.type === "tool_result" && content.is_error) {
            hasRecentError = true;
            break;
          }
        }
        if (hasRecentError) break;
      }
    }
  }

  // Status determination — two separate concerns:
  //
  // 1. hasEndTurn: the agent explicitly sent stop_reason="end_turn"
  //    → For main: only mark completed if ALSO stale (!isRecent) to prevent
  //      flash between turns (user sends new prompt → main briefly "completed").
  //    → For subagents: end_turn is authoritative. Subagents don't get new turns.
  //      Pass { isSubagent: true } to mark completed immediately.
  //
  // 2. !hasEndTurn && !isRecent: agent went quiet without end_turn
  //    → For main: keep "active" — the flash bug (completed→active→completed).
  //    → For subagents: if stale (>30s), the subagent is done — it just didn't
  //      send end_turn (e.g., finished after a tool_use). Safe to mark completed
  //      because subagent events won't resume.
  const status: "active" | "completed" | "error" = hasRecentError
    ? "error"
    : hasEndTurn && (opts?.isSubagent || !isRecent)
      ? "completed"
      : !hasEndTurn && !isRecent && opts?.isSubagent
        ? "completed"
        : "active";

  return {
    tokens: { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, totalCost },
    toolCalls,
    mcpToolCalls,
    status,
    agentDescriptions,
    model: lastModel,
  };
}

export function buildAgentDAG(
  mainEvents: SessionEvent[],
  subagentEvents: Map<string, SessionEvent[]>,
  subagentMeta: Map<string, { agentType: string; description: string }>
): AgentDAG {
  const nodes: AgentNode[] = [];
  const edges: AgentEdge[] = [];

  // Build descriptionToAgentId map for O(1) edge lookups
  const descriptionToAgentId = new Map<string, string>();
  for (const [agentId, meta] of subagentMeta) {
    // First agent with a given description wins (consistent with old behavior)
    if (!descriptionToAgentId.has(meta.description)) {
      descriptionToAgentId.set(meta.description, agentId);
    }
  }

  // Single-pass analysis of main events
  const mainAnalysis = analyzeEvents(mainEvents);

  nodes.push({
    id: "main",
    type: "main",
    description: "Main session",
    tokenUsage: mainAnalysis.tokens,
    toolCalls: mainAnalysis.toolCalls,
    mcpToolCalls: mainAnalysis.mcpToolCalls,
    status: mainAnalysis.status,
    startTime: mainEvents[0]?.timestamp,
    endTime: mainEvents[mainEvents.length - 1]?.timestamp,
    model: mainAnalysis.model,
  });

  // Create edges from Agent tool_use descriptions using O(1) map lookup
  const edgeTargets = new Set<string>();
  for (const desc of mainAnalysis.agentDescriptions) {
    const agentId = descriptionToAgentId.get(desc);
    if (agentId && !edgeTargets.has(agentId)) {
      edgeTargets.add(agentId);
      edges.push({ source: "main", target: agentId });
    }
  }

  // Subagent nodes — single-pass analysis per subagent
  for (const [agentId, events] of subagentEvents) {
    const meta = subagentMeta.get(agentId);
    const analysis = analyzeEvents(events, { isSubagent: true });

    nodes.push({
      id: agentId,
      type: meta?.agentType || agentId,
      description: meta?.description || agentId,
      parentId: "main",
      tokenUsage: analysis.tokens,
      toolCalls: analysis.toolCalls,
      mcpToolCalls: analysis.mcpToolCalls,
      status: analysis.status,
      startTime: events[0]?.timestamp,
      endTime: events[events.length - 1]?.timestamp,
      model: analysis.model,
    });

    // If no edge was created from main, add default
    if (!edgeTargets.has(agentId)) {
      edges.push({ source: "main", target: agentId });
    }
  }

  return { nodes, edges };
}

/**
 * Exported for backward compatibility (used by tests and other modules).
 * Delegates to the single-pass analyzeEvents internally.
 */
export function aggregateTokens(events: SessionEvent[]): AggregatedTokens {
  return analyzeEvents(events).tokens;
}
