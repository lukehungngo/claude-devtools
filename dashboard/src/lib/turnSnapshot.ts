import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  SystemEvent,
  ContentItem,
  SubagentMeta,
} from "./types";
import { calculateTurnCost } from "./cost";
import { mainEventsOnly } from "./turnEventFilters";

// ─── Types ───────────────────────────────────────────────────────────

export interface AgentSummary {
  agentId: string;
  agentType: string;
  /** Human-readable display name for the agent */
  displayName: string;
  invocationCount: number;
  // status REMOVED — derive via isAgentCompleted(agentId, turnEvents) from ./agentStatus.
  // Status must not be stored: storing it creates three parallel derivations that
  // drift across the turn snapshot, the DAG, and the UI surfaces. The predicate is
  // a pure function of events; consumers call it on read.
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
  // status REMOVED — derive via isAgentCompleted("main", getEventsForTurn(turn, allEvents))
  // from ./agentStatus. See AgentSummary above for the rationale; consumers call the
  // predicate on read rather than reading a stored status.
  /** Duration in ms from the system/turn_duration event. Null if no turn_duration event is present. */
  durationMs: number | null;
  /** Flat cost number (sonnet-only pricing) — kept for backward compatibility */
  cost: number;
  /** Detailed cost breakdown with input/output token costs */
  costBreakdown: CostBreakdown;
  startTime: string;
  endTime: string;
  /** Model used in this turn, e.g. "claude-sonnet-4-6". Last model seen wins. */
  model?: string;
  /**
   * Set of agentIds dispatched by main within this turn's window, plus "main".
   * Carried forward across streaming extensions so `extendTurn` can do O(newEvents)
   * work instead of re-scanning the full turn (Architecture Invariant #8).
   * Required: both production builders (`buildTurn`, `extendTurn`) always populate
   * it, and test fixtures are expected to supply it (e.g. `new Set(agents.map(a => a.agentId))`)
   * so invariants can be enforced without optional-chain escape hatches.
   */
  dispatchedAgentIds: Set<string>;
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

// ─── Dispatch-based turn membership (TASK-002) ──────────────────────

/**
 * Window (ms) after a main Task/Agent tool_use during which a sidechain
 * event's agentId is considered "dispatched by that tool_use" when no
 * subagentMeta description match exists.
 */
const TEMPORAL_DISPATCH_WINDOW_MS = 5000;

/**
 * Compute the set of agentIds that were dispatched by main tool_use events
 * within the given event window. "main" is always included unless a `seed`
 * already contains it.
 *
 * Resolution order for each main tool_use (Task/Agent):
 *   1. Description match against subagentMeta: if any entry's description
 *      equals the tool_use input's description AND that agentId is not
 *      already bound, include that agentId.
 *   2. Temporal-proximity fallback: if no description match, find any
 *      non-main event with an agentId whose timestamp falls within
 *      [mainTs, mainTs + TEMPORAL_DISPATCH_WINDOW_MS]. Include its agentId.
 *
 * When `seed` is provided, the result is seeded from it (copied, not mutated).
 * This lets `extendTurn` inherit the dispatched set from the prior snapshot
 * and scan ONLY new events for additional dispatches — O(newEvents) instead of
 * O(turn_events) per streaming batch (Architecture Invariant #8).
 *
 * Events whose agentId is not in the returned set are excluded from
 * turn-level aggregation: they belong to a subagent dispatched by a
 * different turn (cross-turn bleed) or are defensive/rogue events.
 *
 * Known tradeoff: if a main Task tool_use lands in one streaming batch but
 * its temporal-proximity candidate arrives in the NEXT batch, the delta-only
 * scan won't bind — the candidate is outside `events` when the main is
 * processed. In practice the description-match path covers this whenever
 * subagentMeta is populated; the fallback is a defensive path for sessions
 * without meta.
 */
function computeDispatchedAgentIds(
  events: SessionEvent[],
  subagentMeta?: SubagentMeta,
  seed?: Set<string>,
): Set<string> {
  const result = seed ? new Set(seed) : new Set<string>();
  result.add("main");

  for (const event of mainEventsOnly(events)) {
    if (event.type !== "assistant") continue;

    const asst = event as AssistantEvent;
    const contentArr = asst.message?.content;
    if (!Array.isArray(contentArr)) continue;

    const mainTs = new Date(asst.timestamp).getTime();

    for (const item of contentArr) {
      if (item.type !== "tool_use") continue;
      if (item.name !== "Task" && item.name !== "Agent") continue;

      const description = (item.input as Record<string, unknown>)?.description;
      let matched = false;

      // 1. Description match against subagentMeta. Symmetric with the
      //    temporal-proximity branch: skip agentIds already bound so two
      //    concurrent Task tool_uses sharing a description (pathological
      //    but possible) don't collapse to the same agentId.
      if (typeof description === "string" && subagentMeta) {
        for (const [agentId, meta] of Object.entries(subagentMeta)) {
          if (meta.description !== description) continue;
          if (result.has(agentId)) continue;
          result.add(agentId);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 2. Temporal-proximity fallback: find a non-main event within the
      //    window whose agentId we can attribute to this dispatch. Skip
      //    "main", events without an agentId, and agentIds already bound
      //    (so parallel dispatches map to distinct subagents rather than
      //    all collapsing to the first candidate).
      for (const candidate of events) {
        if (candidate.agentId === undefined || candidate.agentId === null) continue;
        if (candidate.agentId === "main") continue;
        if (result.has(candidate.agentId)) continue;
        const candTs = new Date(candidate.timestamp).getTime();
        if (candTs < mainTs) continue;
        if (candTs - mainTs > TEMPORAL_DISPATCH_WINDOW_MS) continue;
        result.add(candidate.agentId);
        break;
      }
    }
  }

  return result;
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
 *
 * Status is NOT derived here; consumers call `isAgentCompleted` on the turn's
 * events from `./agentStatus` instead. Only time-domain fields (durationMs,
 * startTime, endTime) are computed in this builder.
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
  let totalInputCost = 0;
  let totalOutputCost = 0;
  let lastModel = "";
  const agentMap = new Map<
    string,
    { count: number; agentType: string; cost: number; tokensIn: number; tokensOut: number; tools: Set<string> }
  >();

  // TASK-002: restrict agent-map membership to agents dispatched by a main
  // Task/Agent tool_use within this turn's window. Prevents cross-turn bleed
  // where a subagent event from a prior turn falls in the current turn's
  // timestamp range.
  const dispatchedAgentIds = computeDispatchedAgentIds(events, agentMeta);

  for (const event of events) {
    const agentId = event.agentId ?? "main";
    if (!dispatchedAgentIds.has(agentId)) continue;

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
    } else {
      agentMap.set(agentId, {
        count: event.type === "assistant" ? 1 : 0,
        agentType: agentMeta?.[agentId]?.agentType ?? (agentId === "main" ? "main" : agentId),
        cost: eventCost,
        tokensIn: eventTokensIn,
        tokensOut: eventTokensOut,
        tools: new Set(eventTools),
      });
    }
  }

  // Only derive the turn_duration time from the system event. No status
  // derivation happens here: consumers compute status via isAgentCompleted.
  let durationMs: number | null = null;
  for (const event of events) {
    if (event.type === "system" && (event as SystemEvent).subtype === "turn_duration") {
      durationMs = (event as SystemEvent).durationMs ?? null;
      break;
    }
  }

  // Build agent summaries — no status field.
  const agents: AgentSummary[] = [];
  for (const [agentId, info] of agentMap) {
    if (info.count === 0 && agentId !== "main") continue;
    agents.push({
      agentId,
      agentType: info.agentType,
      displayName: agentMeta?.[agentId]?.description || info.agentType,
      invocationCount: info.count,
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
    startIndex,
    endIndex: startIndex + events.length,
    agents,
    durationMs,
    cost,
    costBreakdown: {
      total: cost,
      inputCost: totalInputCost,
      outputCost: totalOutputCost,
    },
    startTime: events[0]?.timestamp ?? "",
    endTime,
    model: lastModel || undefined,
    // Carry the dispatched set forward so extendTurn can inherit it without
    // re-scanning the full turn event range (Architecture Invariant #8).
    dispatchedAgentIds,
  };
}

/**
 * Extend an existing TurnSnapshot with new events, without re-processing old events.
 *
 * Performance invariant (Architecture Invariant #8): this path must be
 * O(newEvents), NOT O(turn_events). The dispatched-agent set is inherited
 * from `existing.dispatchedAgentIds` and `computeDispatchedAgentIds` scans
 * ONLY the delta for additional Task/Agent dispatches.
 *
 * Like `buildTurn`, this function does not derive status. Consumers derive
 * status on read via `isAgentCompleted` from `./agentStatus`.
 */
function extendTurn(
  existing: TurnSnapshot,
  newEvents: SessionEvent[],
  newEndIndex: number,
  agentMeta?: SubagentMeta,
): TurnSnapshot {
  // Start from existing aggregated values
  let cost = existing.cost;
  let totalInputCost = existing.costBreakdown.inputCost;
  let totalOutputCost = existing.costBreakdown.outputCost;
  let lastModel = existing.model ?? "";

  // P2-1: inherit the dispatched set and scan ONLY the delta. Restores the
  // O(newEvents) streaming budget required by Architecture Invariant #8.
  const seed = existing.dispatchedAgentIds;
  const dispatchedAgentIds = computeDispatchedAgentIds(newEvents, agentMeta, seed);

  // Rebuild agent map from existing summaries so we can extend it
  const agentMap = new Map<
    string,
    { count: number; agentType: string; cost: number; tokensIn: number; tokensOut: number; tools: Set<string> }
  >();
  for (const agent of existing.agents) {
    agentMap.set(agent.agentId, {
      count: agent.invocationCount,
      agentType: agent.agentType,
      cost: agent.cost,
      tokensIn: agent.tokensIn,
      tokensOut: agent.tokensOut,
      tools: new Set(agent.tools),
    });
  }

  // Process only the new events
  for (const event of newEvents) {
    const agentId = event.agentId ?? "main";
    if (!dispatchedAgentIds.has(agentId)) continue;

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
    } else {
      agentMap.set(agentId, {
        count: event.type === "assistant" ? 1 : 0,
        agentType: agentMeta?.[agentId]?.agentType ?? (agentId === "main" ? "main" : agentId),
        cost: eventCost,
        tokensIn: eventTokensIn,
        tokensOut: eventTokensOut,
        tools: new Set(eventTools),
      });
    }
  }

  // Update durationMs from any new turn_duration event in the delta; keep the
  // existing value otherwise.
  let durationMs = existing.durationMs;
  for (const event of newEvents) {
    if (event.type === "system" && (event as SystemEvent).subtype === "turn_duration") {
      durationMs = (event as SystemEvent).durationMs ?? durationMs;
      break;
    }
  }

  // Build agent summaries — no status field.
  const agents: AgentSummary[] = [];
  for (const [agentId, info] of agentMap) {
    if (info.count === 0 && agentId !== "main") continue;
    agents.push({
      agentId,
      agentType: info.agentType,
      displayName: agentMeta?.[agentId]?.description || info.agentType,
      invocationCount: info.count,
      cost: info.cost,
      tokensIn: info.tokensIn,
      tokensOut: info.tokensOut,
      tools: Array.from(info.tools),
    });
  }

  const lastNewEvent = newEvents[newEvents.length - 1];
  const endTime = lastNewEvent?.timestamp ?? existing.endTime;

  return {
    turnNumber: existing.turnNumber,
    promptText: existing.promptText,
    startIndex: existing.startIndex,
    endIndex: newEndIndex,
    agents,
    durationMs,
    cost,
    costBreakdown: {
      total: cost,
      inputCost: totalInputCost,
      outputCost: totalOutputCost,
    },
    startTime: existing.startTime,
    endTime,
    model: lastModel || undefined,
    dispatchedAgentIds,
  };
}

// ─── Main function ───────────────────────────────────────────────────

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
    // Cost is O(newEventCount) for aggregation AND for dispatch detection: the
    // dispatched-agent set is inherited from `lastTurn.dispatchedAgentIds` and
    // only `newEvents` is scanned for additional Task dispatches (P2-1 fix).
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

  return turns;
}
