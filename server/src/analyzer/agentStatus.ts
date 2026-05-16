// Behavior must match dashboard/src/lib/agentStatus.ts
//
// Server-side port of the `isAgentCompleted` predicate and `AgentStatus`
// three-state derivation. Dashboard and server are separate packages with
// different `SessionEvent` type definitions; behavior is kept identical via
// mirrored unit tests on both sides. ~100 lines duplicated is acceptable.

import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
  SystemEvent,
  ContentItem,
} from "../types.js";
import { isTerminalStopReason } from "../types.js";

/**
 * Window (ms) for temporal-proximity matching between a main Task/Agent
 * tool_use and the first sidechain event it dispatches. Mirrors
 * `TEMPORAL_DISPATCH_WINDOW_MS` in dashboard/src/lib/turnSnapshot.ts.
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
 * 1. Own terminal stop_reason — the agent's last owned assistant event has
 *    a terminal stop_reason (end_turn, max_tokens, stop_sequence, refusal).
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
 * R-1 (Phase R3B): Resolve dispatching tool_use ids using the SDK's
 * structured `parent_tool_use_id` field (sdk.d.ts:2493 / :3229). Mirrors
 * dashboard/src/lib/agentStatus.ts. Authoritative when present.
 */
function dispatchersFromStructuredField(
  targetAgentId: string,
  events: readonly SessionEvent[],
): Set<string> {
  const result = new Set<string>();
  for (const e of events) {
    if (e.agentId !== targetAgentId) continue;
    if (e.type !== "assistant" && e.type !== "user") continue;
    const ptui = (e as AssistantEvent | UserEvent).parent_tool_use_id;
    if (ptui) result.add(ptui);
  }
  return result;
}

/**
 * Resolve the tool_use ids on main that DISPATCHED the target subagent.
 *
 * R-1 (Phase R3B): prefers the SDK's structured `parent_tool_use_id` field
 * (sdk.d.ts:2493) when ANY event for the target carries it. Falls back to the
 * legacy 5-second temporal-proximity scan for historical JSONL sessions where
 * the field is stripped.
 *
 * Returns the set of `tool_use.id` values that dispatched `targetAgentId`.
 * Empty set ⇒ no dispatching tool_use found (orphan subagent, or tool_use is
 * outside the event window, e.g. cross-batch streaming).
 */
function dispatchingToolUseIds(
  targetAgentId: string,
  events: readonly SessionEvent[],
): Set<string> {
  // Prefer the SDK's authoritative structured field. When ANY event owned by
  // the target carries `parent_tool_use_id`, trust it and skip the temporal
  // scan — the structured path is correct even when JSONL flush timing
  // pushes the sidechain past the 5-second temporal window.
  const structured = dispatchersFromStructuredField(targetAgentId, events);
  if (structured.size > 0) return structured;

  const boundAgents = new Set<string>();
  const result = new Set<string>();

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

// ─── Internal helpers (ported from dashboard/src/lib/turnEventFilters.ts) ──
// Not exported: Option A per TASK-002 plan keeps this self-contained. The
// server has no equivalent of turnEventFilters and TASK-004 will wire the
// predicate into dag-builder without needing these helpers elsewhere.

/**
 * Returns only main-thread events (excludes sidechain subagent events).
 */
function mainEventsOnly(events: readonly SessionEvent[]): SessionEvent[] {
  return events.filter((e) => !e.isSidechain);
}

/**
 * Returns only events owned by the given agentId.
 *
 * - agentId === "main" matches on `!isSidechain`. The sidechain flag is the
 *   reliable ownership invariant for main-thread events; `agentId` absence is
 *   not checked because main events carry no agentId in production.
 * - Any other agentId matches events with that exact agentId.
 */
function eventsForAgent(
  events: readonly SessionEvent[],
  agentId: string,
): SessionEvent[] {
  if (agentId === "main") {
    return events.filter((e) => !e.isSidechain);
  }
  return events.filter((e) => e.agentId === agentId);
}
