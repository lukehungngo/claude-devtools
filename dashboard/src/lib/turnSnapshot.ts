import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  ContentItem,
  SubagentMeta,
} from "./types";

// ─── Types ───────────────────────────────────────────────────────────

export interface AgentSummary {
  agentId: string;
  agentType: string;
  invocationCount: number;
  status: "running" | "completed" | "error";
  cost: number;
}

export interface TurnSnapshot {
  turnNumber: number;
  promptText: string;
  events: SessionEvent[];
  agents: AgentSummary[];
  status: "running" | "completed";
  cost: number;
  startTime: string;
  endTime: string;
}

// ─── Sonnet pricing (matches dag-builder.ts) ─────────────────────────

const INPUT_COST_PER_TOKEN = 0.000003;
const OUTPUT_COST_PER_TOKEN = 0.000015;

// ─── Turn boundary detection ─────────────────────────────────────────

function isTurnBoundary(event: SessionEvent): event is UserEvent {
  if (event.type !== "user") return false;
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

function buildTurn(
  turnNumber: number,
  promptText: string,
  events: SessionEvent[],
  agentMeta?: SubagentMeta
): TurnSnapshot {
  // Compute cost from assistant events
  let cost = 0;
  const agentMap = new Map<
    string,
    { count: number; agentType: string; lastEvent: SessionEvent; cost: number }
  >();

  for (const event of events) {
    const agentId = event.agentId ?? "main";

    let eventCost = 0;
    if (event.type === "assistant") {
      const asst = event as AssistantEvent;
      const usage = asst.message?.usage;
      if (usage) {
        eventCost =
          (usage.input_tokens ?? 0) * INPUT_COST_PER_TOKEN +
          (usage.output_tokens ?? 0) * OUTPUT_COST_PER_TOKEN;
        cost += eventCost;
      }
    }

    // Track agents
    const existing = agentMap.get(agentId);
    if (existing) {
      if (event.type === "assistant") {
        existing.count++;
        existing.cost += eventCost;
      }
      existing.lastEvent = event;
    } else {
      agentMap.set(agentId, {
        count: event.type === "assistant" ? 1 : 0,
        agentType: agentMeta?.[agentId]?.agentType ?? (agentId === "main" ? "main" : agentId),
        lastEvent: event,
        cost: eventCost,
      });
    }
  }

  // Build agent summaries
  const agents: AgentSummary[] = [];
  for (const [agentId, info] of agentMap) {
    if (info.count === 0) continue; // Skip agents with no assistant events
    const lastAsst =
      info.lastEvent.type === "assistant"
        ? (info.lastEvent as AssistantEvent)
        : null;
    const agentStatus: "running" | "completed" | "error" =
      lastAsst?.message?.stop_reason === "end_turn"
        ? "completed"
        : "running";

    agents.push({
      agentId,
      agentType: info.agentType,
      invocationCount: info.count,
      status: agentStatus,
      cost: info.cost,
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

  return {
    turnNumber,
    promptText,
    events,
    agents,
    status,
    cost,
    startTime: events[0]?.timestamp ?? "",
    endTime: events[events.length - 1]?.timestamp ?? "",
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
