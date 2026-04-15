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
  /** Cost in USD for input tokens (including cache write/read) */
  inputCost: number;
  /** Cost in USD for output tokens */
  outputCost: number;
}

export interface TurnSnapshot {
  turnNumber: number;
  promptText: string;
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
  /** Model used in this turn, e.g. "claude-sonnet-4-6". Last model seen wins. */
  model?: string;
}

/**
 * Retrieve events for a turn from the shared allEvents array using index ranges.
 * Avoids copying event arrays per-turn for memory efficiency.
 */
export function getEventsForTurn(turn: TurnSnapshot, allEvents: SessionEvent[]): SessionEvent[] {
  return allEvents.slice(turn.startIndex, turn.endIndex);
}

// ─── System-injected content detection ───────────────────────────────

/**
 * Detect content injected by the system (not typed by the human).
 * These messages are tagged userType:"external" in JSONL but are system-generated:
 * - <task-notification> — background task completion
 * - <local-command-caveat/stdout> — local command output
 * - <command-name> WITHOUT <command-message> — system echo of /commands
 * - [Request interrupted by user] — interruption markers
 * - Skill metadata/expansion — "Base directory for this skill:" and long skill content
 * - Session continuation summaries
 */
function isSystemInjectedText(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("<task-notification>") ||
    t.startsWith("<local-command-caveat>") ||
    t.startsWith("<local-command-stdout>") ||
    (t.startsWith("<command-name>") && !t.includes("<command-message>")) ||
    t.startsWith("[Request interrupted") ||
    t.startsWith("Base directory for this skill:")
  );
}

/**
 * Extract human-readable prompt text from raw event content.
 * Handles <command-message>/<command-args> XML format used by slash commands.
 */
function cleanPromptText(raw: string): string {
  // Slash command format: <command-message>X</command-message>...<command-args>Y</command-args>
  if (raw.includes("<command-message>")) {
    const cmdMatch = /<command-name>([^<]*)<\/command-name>/.exec(raw);
    const argsMatch = /<command-args>([\s\S]*?)<\/command-args>/.exec(raw);
    const cmd = cmdMatch?.[1]?.trim() ?? "";
    const args = argsMatch?.[1]?.trim() ?? "";
    if (cmd) return args ? `${cmd} ${args}` : cmd;
  }
  // Session continuation summaries
  if (raw.trimStart().startsWith("This session is being continued")) {
    return "(continued session)";
  }
  return raw;
}

// ─── Turn boundary detection ─────────────────────────────────────────

function getTextFromContent(content: ContentItem[] | string | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const textItem = content.find(
    (item: ContentItem) => item.type === "text" && "text" in item,
  );
  return textItem && "text" in textItem ? textItem.text : "";
}

function isTurnBoundary(event: SessionEvent): event is UserEvent {
  if (event.type !== "user") return false;
  if (event.isSidechain) return false; // Subagent prompts are not turn boundaries
  const userEvent = event as UserEvent;
  if (userEvent.userType !== "external") return false;
  // isMeta marks system-injected content: skill expansions, image refs, local command output
  if (userEvent.isMeta) return false;
  // toolUseResult indicates this is a tool result response, not a user turn
  if (userEvent.toolUseResult) return false;

  // Must have at least one TextContent item
  const content = userEvent.message?.content;
  if (!content) return false;

  const text = getTextFromContent(content);
  if (!text.trim()) return false;

  // Reject system-injected content not marked with isMeta
  if (isSystemInjectedText(text)) return false;

  return true;
}

function extractPromptText(event: UserEvent): string {
  const raw = getTextFromContent(event.message?.content);
  return cleanPromptText(raw);
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
  let lastModel = "";
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
        const cacheWrite = usage.cache_creation_input_tokens ?? 0;
        const cacheRead = usage.cache_read_input_tokens ?? 0;
        const model = asst.message?.model || "";
        if (model) lastModel = model;
        eventCost = calculateTurnCost(model, eventTokensIn, eventTokensOut, cacheWrite, cacheRead);
        cost += eventCost;
        totalTokensIn += eventTokensIn;
        totalTokensOut += eventTokensOut;
        totalInputCost += calculateTurnCost(model, eventTokensIn, 0, cacheWrite, cacheRead);
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

  // Turn status: check system/turn_duration first (CLI sessions), then fall back
  // to stop_reason === "end_turn" on the last assistant event (web/SDK sessions
  // where turn_duration is never emitted).
  let status: "running" | "completed" = "running";
  let durationMs: number | null = null;
  for (const event of events) {
    if (event.type === "system" && (event as SystemEvent).subtype === "turn_duration") {
      status = "completed";
      durationMs = (event as SystemEvent).durationMs ?? null;
      break;
    }
  }
  if (status === "running") {
    // Find last assistant event and check stop_reason
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "assistant") {
        const asst = events[i] as AssistantEvent;
        if (asst.message?.stop_reason === "end_turn") {
          status = "completed";
        }
        break;
      }
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

  // A turn is not truly "completed" if it has running subagents.
  // The main agent may have sent end_turn (dispatching the subagent),
  // but from the user's perspective, work is still in progress.
  if (status === "completed") {
    const hasRunningSubagent = agents.some(a => a.agentId !== "main" && a.status === "running");
    if (hasRunningSubagent) {
      status = "running";
    }
  }

  const endTime = events[events.length - 1]?.timestamp ?? "";

  return {
    turnNumber,
    promptText,
    startIndex,
    endIndex: startIndex + events.length,
    agents,
    status,
    durationMs,
    cost,
    costBreakdown: {
      total: cost,
      inputCost: totalInputCost,
      outputCost: totalOutputCost,
    },
    startTime: events[0]?.timestamp ?? "",
    completedAt: "",  // Set by groupEventsIntoTurns when turn is finalized
    endTime,
    model: lastModel || undefined,
  };
}

/**
 * Extend an existing TurnSnapshot with new events, without re-processing old events.
 * Only iterates the newEvents slice — O(newEvents) not O(allTurnEvents).
 */
function extendTurn(
  existing: TurnSnapshot,
  newEvents: SessionEvent[],
  newEndIndex: number,
  agentMeta?: SubagentMeta
): TurnSnapshot {
  // Start from existing aggregated values
  let cost = existing.cost;
  let totalInputCost = existing.costBreakdown.inputCost;
  let totalOutputCost = existing.costBreakdown.outputCost;
  let lastModel = existing.model ?? "";

  // Rebuild agent map from existing summaries so we can extend it
  const agentMap = new Map<
    string,
    { count: number; agentType: string; lastEvent: SessionEvent | null; cost: number; tokensIn: number; tokensOut: number; tools: Set<string> }
  >();
  for (const agent of existing.agents) {
    agentMap.set(agent.agentId, {
      count: agent.invocationCount,
      agentType: agent.agentType,
      lastEvent: null, // will be updated if new events arrive for this agent
      cost: agent.cost,
      tokensIn: agent.tokensIn,
      tokensOut: agent.tokensOut,
      tools: new Set(agent.tools),
    });
  }

  // Process only the new events
  for (const event of newEvents) {
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
        const cacheWrite = usage.cache_creation_input_tokens ?? 0;
        const cacheRead = usage.cache_read_input_tokens ?? 0;
        const model = asst.message?.model || "";
        if (model) lastModel = model;
        eventCost = calculateTurnCost(model, eventTokensIn, eventTokensOut, cacheWrite, cacheRead);
        cost += eventCost;
        totalInputCost += calculateTurnCost(model, eventTokensIn, 0, cacheWrite, cacheRead);
        totalOutputCost += calculateTurnCost(model, 0, eventTokensOut);
      }
      const contentArr = asst.message?.content;
      if (Array.isArray(contentArr)) {
        for (const item of contentArr) {
          if (item.type === "tool_use" && "name" in item) {
            eventTools.push(item.name);
          }
        }
      }
    }

    const entry = agentMap.get(agentId);
    if (entry) {
      if (event.type === "assistant") {
        entry.count++;
        entry.cost += eventCost;
        entry.tokensIn += eventTokensIn;
        entry.tokensOut += eventTokensOut;
      }
      for (const t of eventTools) entry.tools.add(t);
      entry.lastEvent = event;
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

  // Re-derive status from new events (don't preserve stale "completed")
  let status: "running" | "completed" = "running";
  let durationMs = existing.durationMs;

  // turn_duration is the definitive completion signal — always wins
  for (const event of newEvents) {
    if (event.type === "system" && (event as SystemEvent).subtype === "turn_duration") {
      status = "completed";
      durationMs = (event as SystemEvent).durationMs ?? null;
      break;
    }
  }

  // If no turn_duration, check the last assistant event for stop_reason
  if (status === "running") {
    for (let i = newEvents.length - 1; i >= 0; i--) {
      if (newEvents[i].type === "assistant") {
        const asst = newEvents[i] as AssistantEvent;
        if (asst.message?.stop_reason === "end_turn") {
          status = "completed";
        }
        break;
      }
    }
  }

  // Build agent summaries
  const agents: AgentSummary[] = [];
  for (const [agentId, info] of agentMap) {
    if (info.count === 0 && agentId !== "main") continue;
    // Determine agent status from the last event we know about
    let agentStatus: "running" | "completed" | "error";
    if (info.lastEvent && info.lastEvent.type === "assistant") {
      const lastAsst = info.lastEvent as AssistantEvent;
      agentStatus = lastAsst.message?.stop_reason === "end_turn" ? "completed" : "running";
    } else if (info.lastEvent === null) {
      // No new events for this agent — preserve status from existing summary
      const existingAgent = existing.agents.find(a => a.agentId === agentId);
      agentStatus = existingAgent?.status ?? "completed";
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

  // A turn is not truly "completed" if it has running subagents.
  // The main agent may have sent end_turn (dispatching the subagent),
  // but from the user's perspective, work is still in progress.
  if (status === "completed") {
    const hasRunningSubagent = agents.some(a => a.agentId !== "main" && a.status === "running");
    if (hasRunningSubagent) {
      status = "running";
    }
  }

  const lastNewEvent = newEvents[newEvents.length - 1];
  const endTime = lastNewEvent?.timestamp ?? existing.endTime;

  return {
    turnNumber: existing.turnNumber,
    promptText: existing.promptText,
    startIndex: existing.startIndex,
    endIndex: newEndIndex,
    agents,
    status,
    durationMs,
    cost,
    costBreakdown: {
      total: cost,
      inputCost: totalInputCost,
      outputCost: totalOutputCost,
    },
    startTime: existing.startTime,
    completedAt: status === "completed" ? endTime : "",
    endTime,
    model: lastModel || undefined,
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

  const newStartIndex = allEvents.length - newEventCount;

  // Check if any new event is a turn boundary
  let hasBoundary = false;
  for (let i = newStartIndex; i < allEvents.length; i++) {
    if (isTurnBoundary(allEvents[i])) {
      hasBoundary = true;
      break;
    }
  }

  const lastTurn = existingTurns[existingTurns.length - 1];

  if (!hasBoundary) {
    // Fast path: no new turn boundary — extend the last turn with only the new events.
    // Cost is O(newEventCount) not O(allEventsFromLastTurnStart).
    // During streaming, 99% of incoming events are assistant/tool events within the same turn.
    const newEvents = allEvents.slice(newStartIndex);
    const extended = extendTurn(lastTurn, newEvents, allEvents.length, subagentMeta);
    return [...existingTurns.slice(0, -1), extended];
  }

  // Slow path: turn boundary found — rebuild from last turn's start
  const eventsToProcess = allEvents.slice(lastTurn.startIndex);
  const rebuiltTurns = groupEventsIntoTurns(eventsToProcess, subagentMeta);

  // Fix turn numbers and startIndex/endIndex to be relative to the full array
  const baseTurnNumber = existingTurns.length; // last existing turn will be replaced
  for (let i = 0; i < rebuiltTurns.length; i++) {
    rebuiltTurns[i].turnNumber = baseTurnNumber + i;
    rebuiltTurns[i].startIndex += lastTurn.startIndex;
    rebuiltTurns[i].endIndex += lastTurn.startIndex;
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
  // Any non-last turn is definitively completed (a next turn boundary exists).
  for (let i = 0; i < turns.length; i++) {
    if (i < turns.length - 1 && turns[i].status === "running") {
      turns[i].status = "completed";
    }
    if (turns[i].status === "completed") {
      finalizeTurn(turns[i]);
    }
  }

  return turns;
}
