import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  ContentItem,
} from "../types.js";

// ── Exported types ───────────────────────────────────────────────────

export interface TurnRecord {
  sessionId: string;
  turnNumber: number;
  promptText: string;
  startTime: string;
  endTime: string;
  status: "running" | "completed";
}

export interface AgentLifecycleRecord {
  sessionId: string;
  turnNumber: number;
  agentId: string;
  agentType: string;
  parentAgentId: string | null;
  spawnedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "error";
  description: string | null;
}

export interface LifecycleEventRecord {
  sessionId: string;
  turnNumber: number;
  agentId: string;
  eventType: string;
  eventJson: string;
  timestamp: string;
  toolName: string | null;
  toolResultError: boolean;
  eventUuid: string;
}

export interface LifecycleRecords {
  turns: TurnRecord[];
  agentLifecycles: AgentLifecycleRecord[];
  lifecycleEvents: LifecycleEventRecord[];
}

export interface LifecycleBuilderState {
  currentTurnNumber: number;
  pendingTurnStartTime: string | null;
  pendingTurnPrompt: string;
  knownAgents: Map<string, { status: string; lastTimestamp: string }>;
  lastEventTimestamp: string | null;
  /** Derived turn status from the last event processed, used for incremental flush */
  lastDerivedTurnStatus: "running" | "completed";
}

// ── Internal helpers ─────────────────────────────────────────────────

function isTurnBoundary(event: SessionEvent): event is UserEvent {
  if (event.type !== "user") return false;
  if (event.isSidechain) return false;
  const userEvent = event as UserEvent;
  if (userEvent.userType !== "external") return false;

  const content = userEvent.message?.content;
  if (!content) return false;
  if (!Array.isArray(content)) return false;
  return content.some(
    (item: ContentItem) =>
      item.type === "text" && "text" in item && (item.text ?? "").trim().length > 0
  );
}

function extractPromptText(event: UserEvent): string {
  const content = event.message?.content;
  if (!content || !Array.isArray(content)) return "";
  const textItem = content.find(
    (item: ContentItem) => item.type === "text"
  );
  return textItem && "text" in textItem ? textItem.text : "";
}

function deriveTurnStatus(lastEvent: SessionEvent): "running" | "completed" {
  if (lastEvent.type === "assistant") {
    const asst = lastEvent as AssistantEvent;
    if (asst.message?.stop_reason === "end_turn") return "completed";
  }
  return "running";
}

function extractToolName(event: AssistantEvent): string | null {
  const content = event.message?.content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === "tool_use" && "name" in item) {
      return item.name;
    }
  }
  return null;
}

function extractToolResultError(event: UserEvent): boolean {
  const content = event.message?.content;
  if (!Array.isArray(content)) return false;
  for (const item of content) {
    if (item.type === "tool_result" && "is_error" in item && item.is_error) {
      return true;
    }
  }
  return false;
}

// ── Core processing logic ────────────────────────────────────────────

interface ProcessingContext {
  sessionId: string;
  subagentMeta: Map<string, { agentType: string; description: string }>;
  agentLifecycleMap: Map<string, AgentLifecycleRecord>;
  turns: TurnRecord[];
  lifecycleEvents: LifecycleEventRecord[];
  currentTurnNumber: number;
  pendingTurnStartTime: string | null;
  pendingTurnPrompt: string;
  lastEventTimestamp: string | null;
  lastEvent: SessionEvent | null;
  lastDerivedTurnStatus: "running" | "completed";
}

function processEvent(ctx: ProcessingContext, event: SessionEvent): void {
  // Turn boundary detection
  if (isTurnBoundary(event)) {
    // Flush pending turn if one exists
    if (ctx.pendingTurnStartTime !== null) {
      // When a new turn boundary arrives, derive status from the last event
      // in the previous turn. In incremental mode, lastEvent may be null if
      // no events were processed yet in this batch, so fall back to the
      // carried-forward status from the previous batch.
      const prevStatus = ctx.lastEvent
        ? deriveTurnStatus(ctx.lastEvent)
        : ctx.lastDerivedTurnStatus;
      ctx.turns.push({
        sessionId: ctx.sessionId,
        turnNumber: ctx.currentTurnNumber,
        promptText: ctx.pendingTurnPrompt,
        startTime: ctx.pendingTurnStartTime,
        endTime: ctx.lastEventTimestamp ?? ctx.pendingTurnStartTime,
        status: prevStatus,
      });
    }
    ctx.currentTurnNumber++;
    ctx.pendingTurnStartTime = event.timestamp;
    ctx.pendingTurnPrompt = extractPromptText(event);
  }

  const effectiveTurn = ctx.currentTurnNumber;
  const agentId = event.agentId ?? "main";

  // Track agent lifecycle
  if (!ctx.agentLifecycleMap.has(agentId)) {
    const meta = ctx.subagentMeta.get(agentId);
    ctx.agentLifecycleMap.set(agentId, {
      sessionId: ctx.sessionId,
      turnNumber: effectiveTurn,
      agentId,
      agentType: meta?.agentType ?? (agentId === "main" ? "main" : "unknown"),
      parentAgentId: agentId === "main" ? null : "main",
      spawnedAt: event.timestamp,
      completedAt: null,
      status: "running",
      description: meta?.description ?? null,
    });
  }

  const lifecycle = ctx.agentLifecycleMap.get(agentId)!;
  lifecycle.completedAt = event.timestamp;
  if (event.type === "assistant") {
    const asst = event as AssistantEvent;
    if (asst.message?.stop_reason === "end_turn") {
      lifecycle.status = "completed";
    }
  }

  // Extract tool metadata
  let toolName: string | null = null;
  let toolResultError = false;

  if (event.type === "assistant") {
    toolName = extractToolName(event as AssistantEvent);
  }
  if (event.type === "user") {
    toolResultError = extractToolResultError(event as UserEvent);
  }

  // Build lifecycle event record
  ctx.lifecycleEvents.push({
    sessionId: ctx.sessionId,
    turnNumber: effectiveTurn,
    agentId,
    eventType: event.type,
    eventJson: JSON.stringify(event),
    timestamp: event.timestamp,
    toolName,
    toolResultError,
    eventUuid: event.uuid,
  });

  ctx.lastEventTimestamp = event.timestamp;
  ctx.lastEvent = event;
  ctx.lastDerivedTurnStatus = deriveTurnStatus(event);
}

// ── Exported functions ───────────────────────────────────────────────

export function createInitialState(): LifecycleBuilderState {
  return {
    currentTurnNumber: 0,
    pendingTurnStartTime: null,
    pendingTurnPrompt: "",
    knownAgents: new Map(),
    lastEventTimestamp: null,
    lastDerivedTurnStatus: "running",
  };
}

export function buildLifecycleRecords(
  sessionId: string,
  events: SessionEvent[],
  subagentMeta: Map<string, { agentType: string; description: string }>
): LifecycleRecords {
  if (events.length === 0) {
    return { turns: [], agentLifecycles: [], lifecycleEvents: [] };
  }

  const ctx: ProcessingContext = {
    sessionId,
    subagentMeta,
    agentLifecycleMap: new Map(),
    turns: [],
    lifecycleEvents: [],
    currentTurnNumber: 0,
    pendingTurnStartTime: null,
    pendingTurnPrompt: "",
    lastEventTimestamp: null,
    lastEvent: null,
    lastDerivedTurnStatus: "running",
  };

  for (const event of events) {
    processEvent(ctx, event);
  }

  // Flush the final pending turn
  if (ctx.pendingTurnStartTime !== null) {
    const lastEvent = events[events.length - 1];
    ctx.turns.push({
      sessionId,
      turnNumber: ctx.currentTurnNumber,
      promptText: ctx.pendingTurnPrompt,
      startTime: ctx.pendingTurnStartTime,
      endTime: lastEvent.timestamp,
      status: deriveTurnStatus(lastEvent),
    });
  }

  // If there were pre-turn events (turn 0), create a turn 0 record
  const hasTurn0Events = ctx.lifecycleEvents.some((e) => e.turnNumber === 0);
  const hasTurn0Record = ctx.turns.some((t) => t.turnNumber === 0);
  if (hasTurn0Events && !hasTurn0Record) {
    const turn0Events = ctx.lifecycleEvents.filter((e) => e.turnNumber === 0);
    ctx.turns.unshift({
      sessionId,
      turnNumber: 0,
      promptText: "",
      startTime: turn0Events[0].timestamp,
      endTime: turn0Events[turn0Events.length - 1].timestamp,
      status: "completed",
    });
  }

  return {
    turns: ctx.turns,
    agentLifecycles: Array.from(ctx.agentLifecycleMap.values()),
    lifecycleEvents: ctx.lifecycleEvents,
  };
}

export function processNewEvents(
  sessionId: string,
  newEvents: SessionEvent[],
  subagentMeta: Map<string, { agentType: string; description: string }>,
  state: LifecycleBuilderState | null
): { records: LifecycleRecords; state: LifecycleBuilderState } {
  const currentState = state ?? createInitialState();

  // Rebuild agent lifecycle map from state's knownAgents
  const agentLifecycleMap = new Map<string, AgentLifecycleRecord>();
  for (const [agentId, info] of currentState.knownAgents) {
    const meta = subagentMeta.get(agentId);
    agentLifecycleMap.set(agentId, {
      sessionId,
      turnNumber: 0, // not tracked in state; agent already exists
      agentId,
      agentType: meta?.agentType ?? (agentId === "main" ? "main" : "unknown"),
      parentAgentId: agentId === "main" ? null : "main",
      spawnedAt: info.lastTimestamp,
      completedAt: info.lastTimestamp,
      status: info.status as "running" | "completed" | "error",
      description: meta?.description ?? null,
    });
  }

  const ctx: ProcessingContext = {
    sessionId,
    subagentMeta,
    agentLifecycleMap,
    turns: [],
    lifecycleEvents: [],
    currentTurnNumber: currentState.currentTurnNumber,
    pendingTurnStartTime: currentState.pendingTurnStartTime,
    pendingTurnPrompt: currentState.pendingTurnPrompt,
    lastEventTimestamp: currentState.lastEventTimestamp,
    lastEvent: null,
    lastDerivedTurnStatus: currentState.lastDerivedTurnStatus,
  };

  // Track which agents existed before this batch
  const preExistingAgents = new Set(currentState.knownAgents.keys());

  for (const event of newEvents) {
    processEvent(ctx, event);
  }

  // Note: we do NOT flush the final pending turn here because
  // incremental mode only emits completed turns (a turn is completed
  // when the next boundary arrives). The pending turn remains in state.

  // Build updated state
  const updatedKnownAgents = new Map<string, { status: string; lastTimestamp: string }>();
  for (const [agentId, lifecycle] of ctx.agentLifecycleMap) {
    updatedKnownAgents.set(agentId, {
      status: lifecycle.status,
      lastTimestamp: lifecycle.completedAt ?? lifecycle.spawnedAt,
    });
  }

  // Return all agent lifecycles (new and updated — upsert handles dedup)
  const newOrUpdatedAgents = Array.from(ctx.agentLifecycleMap.values());

  const updatedState: LifecycleBuilderState = {
    currentTurnNumber: ctx.currentTurnNumber,
    pendingTurnStartTime: ctx.pendingTurnStartTime,
    pendingTurnPrompt: ctx.pendingTurnPrompt,
    knownAgents: updatedKnownAgents,
    lastEventTimestamp: ctx.lastEventTimestamp,
    lastDerivedTurnStatus: ctx.lastDerivedTurnStatus,
  };

  return {
    records: {
      turns: ctx.turns,
      agentLifecycles: newOrUpdatedAgents,
      lifecycleEvents: ctx.lifecycleEvents,
    },
    state: updatedState,
  };
}
