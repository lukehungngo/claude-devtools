import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  SystemEvent,
  ContentItem,
  SubagentMeta,
} from "./types";
import { calculateTurnCost } from "./cost";

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
  /** Start index (inclusive) into the shared allEvents array */
  startIndex: number;
  /** End index (exclusive) into the shared allEvents array */
  endIndex: number;
  agents: AgentSummary[];
  status: "running" | "completed";
  /** Duration in ms from the system/turn_duration event. Null if turn is still running. */
  durationMs: number | null;
  /** Flat cost number (sonnet-only pricing) — kept for backward compatibility */
  cost: number;
  /** Detailed cost breakdown with input/output token costs */
  costBreakdown: CostBreakdown;
  startTime: string;
  /** When the turn completed (same as endTime for completed turns, empty for running) */
  completedAt: string;
  endTime: string;
}

/**
 * Retrieve events for a turn from the shared allEvents array using index ranges.
 * Avoids copying event arrays per-turn for memory efficiency.
 */
export function getEventsForTurn(turn: TurnSnapshot, allEvents: SessionEvent[]): SessionEvent[] {
  return allEvents.slice(turn.startIndex, turn.endIndex);
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
 * Uses per-model pricing via calculateTurnCost() — matches server-side pricing.
 */
function buildTurn(
  turnNumber: number,
  promptText: string,
  events: SessionEvent[],
  startIndex: number,
  agentMeta?: SubagentMeta
): TurnSnapshot {
  // Compute cost from assistant events (per-model pricing)
  let cost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalInputCost = 0;
  let totalOutputCost = 0;
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
        const model = asst.message?.model || "";
        eventCost = calculateTurnCost(model, eventTokensIn, eventTokensOut);
        cost += eventCost;
        totalTokensIn += eventTokensIn;
        totalTokensOut += eventTokensOut;
        totalInputCost += calculateTurnCost(model, eventTokensIn, 0);
        totalOutputCost += calculateTurnCost(model, 0, eventTokensOut);
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

  // Turn status is determined solely by the presence of a system/turn_duration event.
  // No fallback to stop_reason or next-boundary detection.
  let status: "running" | "completed" = "running";
  let durationMs: number | null = null;
  for (const event of events) {
    if (event.type === "system" && (event as SystemEvent).subtype === "turn_duration") {
      status = "completed";
      durationMs = (event as SystemEvent).durationMs ?? null;
      break;
    }
  }

  // Build agent summaries — agent status also defaults to "running".
  // groupEventsIntoTurns will finalize completed turns' agent statuses.
  const agents: AgentSummary[] = [];
  for (const [agentId, info] of agentMap) {
    if (info.count === 0 && agentId !== "main") continue;
    const lastAsst =
      info.lastEvent.type === "assistant"
        ? (info.lastEvent as AssistantEvent)
        : null;
    let agentStatus: "running" | "completed" | "error";
    if (lastAsst) {
      agentStatus = lastAsst.message?.stop_reason === "end_turn" ? "completed" : "running";
    } else {
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

  const endTime = events[events.length - 1]?.timestamp ?? "";

  return {
    turnNumber,
    promptText,
    // TODO(perf): Remove events duplication — consumers should use getEventsForTurn(turn, allEvents).
    // Blocked on 6 call sites: RightPanel, TurnCard (x3), RewindMenu, searchIndex.
    events,
    startIndex,
    endIndex: startIndex + events.length,
    agents,
    status,
    durationMs,
    cost,
    costBreakdown: {
      total: cost,
      tokensIn: totalInputCost,
      tokensOut: totalOutputCost,
    },
    startTime: events[0]?.timestamp ?? "",
    completedAt: "",  // Set by groupEventsIntoTurns when turn is finalized
    endTime,
  };
}

// ─── Main function ───────────────────────────────────────────────────

function finalizeTurn(turn: TurnSnapshot): void {
  turn.status = "completed";
  turn.completedAt = turn.endTime;
  for (const agent of turn.agents) {
    if (agent.status === "running") {
      agent.status = "completed";
    }
  }
}

/**
 * Incremental turn grouping: only rebuilds from the last turn boundary.
 * When new events are appended, we avoid re-processing all earlier turns.
 *
 * @param existingTurns - turns from the previous computation
 * @param allEvents - the full event array (existing + new)
 * @param newEventCount - how many new events were appended since last computation
 * @param subagentMeta - optional agent metadata
 */
export function groupEventsIntoTurnsIncremental(
  existingTurns: TurnSnapshot[],
  allEvents: SessionEvent[],
  newEventCount: number,
  subagentMeta?: SubagentMeta
): TurnSnapshot[] {
  // Fall back to full rebuild when there are no existing turns or all events are new
  if (existingTurns.length === 0 || newEventCount >= allEvents.length) {
    return groupEventsIntoTurns(allEvents, subagentMeta);
  }

  // Only re-process from the last turn's start index onward
  const lastTurnStartIndex = existingTurns[existingTurns.length - 1].startIndex;
  const eventsToProcess = allEvents.slice(lastTurnStartIndex);

  // Re-group just the tail portion
  const rebuiltTurns = groupEventsIntoTurns(eventsToProcess, subagentMeta);

  // Fix turn numbers and startIndex/endIndex to be relative to the full array
  const baseTurnNumber = existingTurns.length; // last existing turn will be replaced
  for (let i = 0; i < rebuiltTurns.length; i++) {
    rebuiltTurns[i].turnNumber = baseTurnNumber + i;
    rebuiltTurns[i].startIndex += lastTurnStartIndex;
    rebuiltTurns[i].endIndex += lastTurnStartIndex;
  }

  // Replace last turn with rebuilt turns (may be 1 or more if new turn boundaries appeared)
  return [...existingTurns.slice(0, -1), ...rebuiltTurns];
}

export function groupEventsIntoTurns(
  events: SessionEvent[],
  agentMeta?: SubagentMeta
): TurnSnapshot[] {
  if (events.length === 0) return [];

  const turns: TurnSnapshot[] = [];
  let currentEvents: SessionEvent[] = [];
  let currentPrompt = "";
  let turnNumber = 1;
  let currentStartIndex = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (isTurnBoundary(event)) {
      // Flush previous turn if it has events
      if (currentEvents.length > 0) {
        turns.push(buildTurn(turnNumber, currentPrompt, currentEvents, currentStartIndex, agentMeta));
        turnNumber++;
        currentStartIndex = i;
        currentEvents = [];
      }
      currentPrompt = extractPromptText(event);
      currentEvents.push(event);
    } else {
      currentEvents.push(event);
    }
  }

  // Flush remaining events (this is the last/current turn)
  if (currentEvents.length > 0) {
    turns.push(buildTurn(turnNumber, currentPrompt, currentEvents, currentStartIndex, agentMeta));
  }

  // Finalize completed turns: set completedAt and agent statuses.
  // Turn status is already determined by buildTurn() from turn_duration events.
  for (const turn of turns) {
    if (turn.status === "completed") {
      finalizeTurn(turn);
    }
  }

  return turns;
}
