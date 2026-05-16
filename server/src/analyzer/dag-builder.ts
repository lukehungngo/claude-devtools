import type {
  SessionEvent,
  AgentDAG,
  AgentNode,
  AgentEdge,
  AggregatedTokens,
} from "../types.js";
import { calculateTokenCost } from "./metrics.js";
import { normalizeContent } from "../lib/normalizeContent.js";
import { getAgentStatus } from "./agentStatus.js";
import { toolUseIdToSyntheticAgent } from "../lib/agentIds.js";

/**
 * Walk events for a `tool_result` block keyed by `toolUseId`.
 * Server-side mirror of dashboard/src/lib/agentStatus.ts#findToolResultForId.
 */
function findToolResultForId(
  events: SessionEvent[],
  toolUseId: string,
): { timestamp: string; isError: boolean } | null {
  for (const e of events) {
    if (e.type !== "user") continue;
    if (e.isSidechain) continue;
    const content = normalizeContent(e.message.content);
    for (const c of content) {
      if (c.type !== "tool_result") continue;
      if ((c as { tool_use_id?: string }).tool_use_id === toolUseId) {
        return {
          timestamp: e.timestamp,
          isError: !!(c as { is_error?: boolean }).is_error,
        };
      }
    }
  }
  return null;
}

/**
 * Analyze a list of events in a single pass, returning:
 * - token aggregation
 * - tool call count
 * - MCP tool call count
 * - error flag (any tool_result in user events has is_error === true)
 * - agent tool_use descriptions found (for edge detection)
 * - last-seen model
 *
 * Status derivation (completed vs active) is NOT done here. It's computed
 * in buildAgentDAG by calling getAgentStatus(agentId, events, sessionIsRunning),
 * which reads the three terminal signals (end_turn, turn_duration, parent
 * tool_result ack) and incorporates session-level activity. Error detection
 * stays here because it's a content check on the same event stream.
 */
function analyzeEvents(events: SessionEvent[]): {
  tokens: AggregatedTokens;
  toolCalls: number;
  mcpToolCalls: number;
  hasError: boolean;
  agentDescriptions: string[];
  agentDispatches: Array<{
    toolUseId: string;
    description: string;
    subagentType?: string;
    timestamp: string;
  }>;
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
  const agentDispatches: Array<{
    toolUseId: string;
    description: string;
    subagentType?: string;
    timestamp: string;
  }> = [];

  // Error is a content check: any tool_result across the given events with
  // is_error === true. Not bounded by a time window — if an error exists in
  // the stream, the agent is in error state.
  let hasError = false;

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
            const input = content.input as Record<string, unknown>;
            const desc = input.description as string;
            if (desc) agentDescriptions.push(desc);
            // Phase 3: capture dispatch metadata for synthetic-node creation
            if (content.id && desc) {
              agentDispatches.push({
                toolUseId: content.id,
                description: desc,
                subagentType: typeof input.subagent_type === "string" ? input.subagent_type : undefined,
                timestamp: event.timestamp,
              });
            }
          }
        }
      }
    } else if (event.type === "user" && !hasError) {
      for (const content of normalizeContent(event.message.content)) {
        if (content.type === "tool_result" && content.is_error) {
          hasError = true;
          break;
        }
      }
    }
  }

  return {
    tokens: { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, totalCost },
    toolCalls,
    mcpToolCalls,
    hasError,
    agentDescriptions,
    agentDispatches,
    model: lastModel,
  };
}

/**
 * Derive a node's status from error flag + getAgentStatus.
 * Error takes precedence over completion.
 */
function deriveStatus(
  agentId: string,
  events: readonly SessionEvent[],
  hasError: boolean,
  sessionIsRunning: boolean,
): "active" | "completed" | "error" {
  if (hasError) return "error";
  const status = getAgentStatus(agentId, events, sessionIsRunning);
  // "indeterminate" = session closed, no terminal signal → agent is no longer running
  return status === "running" ? "active" : "completed";
}

export function buildAgentDAG(
  mainEvents: SessionEvent[],
  subagentEvents: Map<string, SessionEvent[]>,
  subagentMeta: Map<string, { agentType: string; description: string }>,
  sessionIsRunning: boolean = true,
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
    status: deriveStatus("main", mainEvents, mainAnalysis.hasError, sessionIsRunning),
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

  // Subagent nodes — single-pass analysis per subagent.
  // Status derivation for subagents requires scanning the parent's events
  // (Signal 3: parent tool_result ack). Merge main + subagent events for the
  // predicate call; the predicate filters by ownership internally.
  for (const [agentId, events] of subagentEvents) {
    const meta = subagentMeta.get(agentId);
    const analysis = analyzeEvents(events);
    const mergedForPredicate: SessionEvent[] = [...mainEvents, ...events];

    nodes.push({
      id: agentId,
      type: meta?.agentType || agentId,
      description: meta?.description || agentId,
      parentId: "main",
      tokenUsage: analysis.tokens,
      toolCalls: analysis.toolCalls,
      mcpToolCalls: analysis.mcpToolCalls,
      status: deriveStatus(agentId, mergedForPredicate, analysis.hasError, sessionIsRunning),
      startTime: events[0]?.timestamp,
      endTime: events[events.length - 1]?.timestamp,
      model: analysis.model,
    });

    // If no edge was created from main, add default
    if (!edgeTargets.has(agentId)) {
      edges.push({ source: "main", target: agentId });
    }
  }

  // Phase 3.5: synthetic nodes for Agent dispatches that have no own events
  // and no descriptionToAgentId match. In this Claude Code variant, subagents
  // don't emit sidechain events into the parent JSONL; the only signal that a
  // dispatch occurred is the Agent tool_use itself, with completion detected
  // via the matching tool_result.tool_use_id.
  const syntheticAdded = new Set<string>();
  for (const dispatch of mainAnalysis.agentDispatches) {
    const realAgentId = descriptionToAgentId.get(dispatch.description);
    if (realAgentId && subagentEvents.has(realAgentId)) {
      // Real subagent already represented in the loop above; skip synthetic.
      continue;
    }
    const syntheticId = toolUseIdToSyntheticAgent(dispatch.toolUseId);
    if (syntheticAdded.has(syntheticId)) continue;
    syntheticAdded.add(syntheticId);

    const result = findToolResultForId(mainEvents, dispatch.toolUseId);
    const status: AgentNode["status"] = result === null
      ? "active"
      : result.isError
        ? "error"
        : "completed";

    nodes.push({
      id: syntheticId,
      type: dispatch.subagentType ?? "subagent",
      description: dispatch.description,
      parentId: "main",
      // Token data is unavailable for synthetic agents — emit zeroes so the
      // shape stays compatible; UI keys off the synthetic prefix to render "—".
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
      },
      toolCalls: 0,
      mcpToolCalls: 0,
      status,
      startTime: dispatch.timestamp,
      endTime: result?.timestamp,
    });
    if (!edgeTargets.has(syntheticId)) {
      edges.push({ source: "main", target: syntheticId });
      edgeTargets.add(syntheticId);
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
