import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  ContentItem,
  SubagentMeta,
} from "./types";
import { INPUT_COST_PER_TOKEN, OUTPUT_COST_PER_TOKEN } from "./cost";

// ─── Types ───────────────────────────────────────────────────────────

export interface AgentSummary {
  agentId: string;
  agentType: string;
  /** Human-readable display name for the agent */
  displayName: string;
  invocationCount: number;
  status: "running" | "completed" | "error";
  cost: number;
  /** Input tokens consumed by this agent in the turn */
  tokensIn: number;
  /** Output tokens produced by this agent in the turn */
  tokensOut: number;
  /** Tool names used by this agent in the turn */
  tools: string[];
}

export interface CostBreakdown {
  total: number;
  tokensIn: number;
  tokensOut: number;
}

export interface TurnSnapshot {
  turnNumber: number;
  promptText: string;
  events: SessionEvent[];
  agents: AgentSummary[];
  status: "running" | "completed";
  /** Flat cost number (sonnet-only pricing) — kept for backward compatibility */
  cost: number;
  /** Detailed cost breakdown with input/output token costs */
  costBreakdown: CostBreakdown;
  startTime: string;
  /** When the turn completed (same as endTime for completed turns, empty for running) */
  completedAt: string;
  endTime: string;
}

// ─── Turn boundary detection ─────────────────────────────────────────

function isTurnBoundary(event: SessionEvent): event is UserEvent {
  if (event.type !== "user") return false;
  if (event.isSidechain) return false; // Subagent prompts are not turn boundaries
  const userEvent = event as UserEvent;
  if (userEvent.userType !== "external") return false;

  // Must have at least one TextContent item
  const content = userEvent.message?.content;
  if (!content) return false;
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some(
    (item: ContentItem) => item.type === "text" && "text" in item && (item.text ?? "").trim().length > 0
  );
}

function extractPromptText(event: UserEvent): string {
  const content = event.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const textItem = content.find(
    (item: ContentItem) => item.type === "text"
  );
  return textItem && "text" in textItem ? textItem.text : "";
}

// ─── Build turn from accumulated events ──────────────────────────────

/**
 * Build a TurnSnapshot from accumulated events.
 * @note Per-turn cost uses hardcoded sonnet pricing (INPUT_COST_PER_TOKEN / OUTPUT_COST_PER_TOKEN).
 * This may differ from the per-model pricing in SessionMetrics.tokens.totalCost.
 */
function buildTurn(
  turnNumber: number,
  promptText: string,
  events: SessionEvent[],
  agentMeta?: SubagentMeta
): TurnSnapshot {
  // Compute cost from assistant events
  let cost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const agentMap = new Map<
    string,
    { count: number; agentType: string; lastEvent: SessionEvent; cost: number; tokensIn: number; tokensOut: number; tools: Set<string> }
  >();

  for (const event of events) {
    const agentId = event.agentId ?? "main";

    let eventCost = 0;
    let eventTokensIn = 0;
    let eventTokensOut = 0;
    const eventTools: string[] = [];

    if (event.type === "assistant") {
      const asst = event as AssistantEvent;
      const usage = asst.message?.usage;
      if (usage) {
        eventTokensIn = usage.input_tokens ?? 0;
        eventTokensOut = usage.output_tokens ?? 0;
        eventCost = eventTokensIn * INPUT_COST_PER_TOKEN + eventTokensOut * OUTPUT_COST_PER_TOKEN;
        cost += eventCost;
        totalTokensIn += eventTokensIn;
        totalTokensOut += eventTokensOut;
      }
      // Collect tool names from content
      const contentArr = asst.message?.content;
      if (Array.isArray(contentArr)) {
        for (const item of contentArr) {
          if (item.type === "tool_use" && "name" in item) {
            eventTools.push(item.name);
          }
        }
      }
    }

    // Track agents
    const existing = agentMap.get(agentId);
    if (existing) {
      if (event.type === "assistant") {
        existing.count++;
        existing.cost += eventCost;
        existing.tokensIn += eventTokensIn;
        existing.tokensOut += eventTokensOut;
      }
      for (const t of eventTools) existing.tools.add(t);
      existing.lastEvent = event;
    } else {
      agentMap.set(agentId, {
        count: event.type === "assistant" ? 1 : 0,
        agentType: agentMeta?.[agentId]?.agentType ?? (agentId === "main" ? "main" : agentId),
        lastEvent: event,
        cost: eventCost,
        tokensIn: eventTokensIn,
        tokensOut: eventTokensOut,
        tools: new Set(eventTools),
      });
    }
  }

  // Build agent summaries
  const agents: AgentSummary[] = [];
  for (const [agentId, info] of agentMap) {
    // Skip non-main agents with no assistant events, but always include
    // main so every turn has at least one agent in its .agents array.
    if (info.count === 0 && agentId !== "main") continue;
    const lastAsst =
      info.lastEvent.type === "assistant"
        ? (info.lastEvent as AssistantEvent)
        : null;
    let agentStatus: "running" | "completed" | "error";
    if (lastAsst) {
      agentStatus = lastAsst.message?.stop_reason === "end_turn" ? "completed" : "running";
    } else {
      // No assistant event for this agent in this turn (e.g., main with
      // only a user event). Default to "completed" — if the turn exists
      // as a distinct turn, the agent's work for this turn is done.
      agentStatus = "completed";
    }

    agents.push({
      agentId,
      agentType: info.agentType,
      displayName: agentMeta?.[agentId]?.description || info.agentType,
      invocationCount: info.count,
      status: agentStatus,
      cost: info.cost,
      tokensIn: info.tokensIn,
      tokensOut: info.tokensOut,
      tools: Array.from(info.tools),
    });
  }

  // Determine turn status from last event
  const lastEvent = events[events.length - 1];
  let status: "running" | "completed" = "running";
  if (lastEvent?.type === "assistant") {
    const lastAsst = lastEvent as AssistantEvent;
    if (lastAsst.message?.stop_reason === "end_turn") {
      status = "completed";
    }
  }

  const endTime = events[events.length - 1]?.timestamp ?? "";

  return {
    turnNumber,
    promptText,
    events,
    agents,
    status,
    cost,
    costBreakdown: {
      total: cost,
      tokensIn: totalTokensIn * INPUT_COST_PER_TOKEN,
      tokensOut: totalTokensOut * OUTPUT_COST_PER_TOKEN,
    },
    startTime: events[0]?.timestamp ?? "",
    completedAt: status === "completed" ? endTime : "",
    endTime,
  };
}

// ─── Main function ───────────────────────────────────────────────────

export function groupEventsIntoTurns(
  events: SessionEvent[],
  agentMeta?: SubagentMeta
): TurnSnapshot[] {
  if (events.length === 0) return [];

  const turns: TurnSnapshot[] = [];
  let currentEvents: SessionEvent[] = [];
  let currentPrompt = "";
  let turnNumber = 1;

  for (const event of events) {
    if (isTurnBoundary(event)) {
      // Flush previous turn if it has events
      if (currentEvents.length > 0) {
        turns.push(buildTurn(turnNumber, currentPrompt, currentEvents, agentMeta));
        turnNumber++;
        currentEvents = [];
      }
      currentPrompt = extractPromptText(event);
      currentEvents.push(event);
    } else {
      currentEvents.push(event);
    }
  }

  // Flush remaining events
  if (currentEvents.length > 0) {
    turns.push(buildTurn(turnNumber, currentPrompt, currentEvents, agentMeta));
  }

  return turns;
}
