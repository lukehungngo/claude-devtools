import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
  SystemEvent,
  ContentItem,
} from "./types";
import { isTerminalStopReason } from "./types";
import { eventsForAgent, mainEventsOnly } from "./turnEventFilters";

/**
 * Window (ms) for temporal-proximity matching between a main Task/Agent
 * tool_use and the first sidechain event it dispatches. Mirrors
 * `TEMPORAL_DISPATCH_WINDOW_MS` in turnSnapshot.ts.
 */
const DISPATCH_WINDOW_MS = 5000;

/**
 * Three-state agent status. Derived from events, never stored.
 *
 * - `running`     — no terminal signal present AND session is still active
 * - `completed`   — any terminal signal present (end_turn, turn_duration, parent ack)
 * - `indeterminate` — no terminal signal AND session is closed (truncated / aborted data)
 */
export type AgentStatus = "running" | "completed" | "indeterminate";

/**
 * An agent is COMPLETED iff any of these three terminal signals is present
 * in the event stream:
 *
 * 1. Own end_turn — the agent's last owned assistant event has
 *    stop_reason === "end_turn".
 * 2. Turn duration — a system event with subtype === "turn_duration"
 *    (authoritative for main only; SDK emits one per main turn).
 * 3. Parent ack — the parent emitted a user event with a tool_result whose
 *    `tool_use_id` matches the id of the Task/Agent tool_use that dispatched
 *    this subagent. Strict tool_use_id chain (brainstorm spec); the
 *    dispatching tool_use is resolved via temporal-proximity matching over
 *    main's Task/Agent tool_uses. When no dispatching tool_use is
 *    attributable (orphan subagent, or the tool_use is outside the current
 *    event window, e.g. cross-batch streaming), the predicate falls back to
 *    a weaker form: any tool_result postdating the subagent's last event
 *    counts. The strict form takes precedence whenever it can be resolved,
 *    so concurrent Task dispatches never false-positive via the fallback.
 *
 * Pure function of the events array. No timer. No staleness heuristic.
 * Identical events always produce identical output.
 */
export function isAgentCompleted(
  agentId: string,
  events: readonly SessionEvent[],
): boolean {
  // Signal 1: last owned assistant event's stop_reason
  const owned = eventsForAgent(events, agentId);
  for (let i = owned.length - 1; i >= 0; i--) {
    if (owned[i].type !== "assistant") continue;
    const stop = (owned[i] as AssistantEvent).message.stop_reason;
    if (isTerminalStopReason(stop)) return true;
    // Last assistant found but not terminal — fall through to other signals.
    break;
  }

  return tryOtherSignals(agentId, events);
}

function tryOtherSignals(
  agentId: string,
  events: readonly SessionEvent[],
): boolean {
  // Signal 2: main-only turn_duration
  if (agentId === "main") {
    for (const e of events) {
      if (
        e.type === "system" &&
        (e as SystemEvent).subtype === "turn_duration"
      ) {
        return true;
      }
    }
    return false;
  }

  // Signal 3: parent tool_result acknowledgment (subagents only)
  return hasParentToolResultAck(agentId, events);
}

/**
 * Resolve the tool_use ids on main that DISPATCHED the target subagent.
 *
 * Mirrors the temporal-proximity logic in turnSnapshot.ts `computeDispatchedAgentIds`:
 * for each main assistant `tool_use` with name=="Task"|"Agent", find the FIRST
 * sidechain event whose agentId isn't already bound, within DISPATCH_WINDOW_MS
 * of the tool_use. That sidechain's agentId is considered dispatched by this
 * tool_use.
 *
 * Returns the set of `tool_use.id` values that dispatched `targetAgentId`.
 * Empty set ⇒ no dispatching tool_use found (orphan subagent, or tool_use is
 * outside the event window, e.g. cross-batch streaming).
 */
function dispatchingToolUseIds(
  targetAgentId: string,
  events: readonly SessionEvent[],
): Set<string> {
  const boundAgents = new Set<string>();
  const result = new Set<string>();

  // Walk main assistant events in order. For each Task/Agent tool_use, attribute
  // the next available sidechain-agentId within the temporal window.
  const mainEvts = mainEventsOnly(events);
  for (const e of mainEvts) {
    if (e.type !== "assistant") continue;
    const content = (e as AssistantEvent).message.content;
    if (!Array.isArray(content)) continue;

    const mainTs = new Date(e.timestamp).getTime();
    for (const item of content) {
      if (item.type !== "tool_use") continue;
      if (item.name !== "Task" && item.name !== "Agent") continue;

      for (const cand of events) {
        if (cand.agentId === undefined || cand.agentId === null) continue;
        if (cand.agentId === "main") continue;
        if (boundAgents.has(cand.agentId)) continue;
        const candTs = new Date(cand.timestamp).getTime();
        if (candTs < mainTs) continue;
        if (candTs - mainTs > DISPATCH_WINDOW_MS) continue;

        boundAgents.add(cand.agentId);
        if (cand.agentId === targetAgentId) {
          result.add(item.id);
        }
        break;
      }
    }
  }

  return result;
}

function hasParentToolResultAck(
  agentId: string,
  events: readonly SessionEvent[],
): boolean {
  const owned = eventsForAgent(events, agentId);
  if (owned.length === 0) return false;

  // STRICT FORM (brainstorm spec): match parent's tool_result by
  // tool_use_id → dispatching Task/Agent tool_use → this agentId.
  // This closes the false-positive surface if concurrent Task dispatches
  // are ever introduced (the weak form would match any postdating tool_result).
  const dispatchIds = dispatchingToolUseIds(agentId, events);
  const mainEvts = mainEventsOnly(events);
  if (dispatchIds.size > 0) {
    for (const e of mainEvts) {
      if (e.type !== "user") continue;
      const content = (e as UserEvent).message.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type !== "tool_result") continue;
        if (dispatchIds.has(c.tool_use_id)) return true;
      }
    }
    // Strict resolution attempted but no matching ack found. Do NOT fall back
    // to the weak form — that would re-introduce the false-positive surface
    // the strict form exists to close (T-SIG3-STRICT-2).
    return false;
  }

  // WEAK FALLBACK: no dispatching tool_use is attributable to this agentId
  // (orphan subagent, or the Task tool_use is outside the event window, e.g.
  // cross-batch streaming). Preserve today's empirical safety: if main emitted
  // any tool_result AFTER the subagent's last event, consider it acknowledged.
  const subagentLastTs = new Date(owned[owned.length - 1].timestamp).getTime();
  for (const e of mainEvts) {
    if (e.type !== "user") continue;
    const content = (e as UserEvent).message.content;
    if (!Array.isArray(content)) continue;
    const hasToolResult = content.some(
      (c: ContentItem) => c.type === "tool_result",
    );
    if (!hasToolResult) continue;
    const mainTs = new Date(e.timestamp).getTime();
    if (mainTs > subagentLastTs) return true;
  }
  return false;
}

/**
 * Returns the three-state agent status.
 *
 * - `completed`     when any terminal signal is present
 * - `running`       when no signal AND the session is still active
 * - `indeterminate` when no signal AND the session is closed — the JSONL
 *                   was truncated, the session was aborted, or data is
 *                   incomplete for some other reason
 */
export function getAgentStatus(
  agentId: string,
  events: readonly SessionEvent[],
  sessionIsActive: boolean,
): AgentStatus {
  if (isAgentCompleted(agentId, events)) return "completed";
  if (!sessionIsActive) return "indeterminate";
  return "running";
}
