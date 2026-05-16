import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
  SystemEvent,
  QueueOperationEvent,
  ContentItem,
} from "./types";
import { isTerminalStopReason } from "./types";
import { eventsForAgent, mainEventsOnly } from "./turnEventFilters";
import { isSyntheticAgentId, syntheticToToolUseId } from "./agentIds";

/**
 * The tool_result that comes back ~300ms after an async `Agent` tool_use
 * (`run_in_background: true`) is a dispatch HANDLE, not a completion. Its
 * content always begins with the literal string below — Claude Code uses it
 * to identify dispatch acknowledgements (verified 26/26 in the screenshot
 * session 23ba0306).
 *
 * Treating that tool_result as "completed" was the root cause of the
 * "Background agents show ✓ done 0s while still running" bug.
 */
const ASYNC_DISPATCH_ACK_PREFIX = "Async agent launched successfully";

function getToolResultText(item: unknown): string {
  if (typeof item !== "object" || item === null) return "";
  const content = (item as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const c of content) {
      if (
        typeof c === "object" && c !== null &&
        (c as { type?: string }).type === "text" &&
        typeof (c as { text?: string }).text === "string"
      ) {
        return (c as { text: string }).text;
      }
    }
  }
  return "";
}

function isAsyncDispatchAck(item: unknown): boolean {
  return getToolResultText(item).startsWith(ASYNC_DISPATCH_ACK_PREFIX);
}

/**
 * Find the `<task-notification>` event whose embedded `<tool-use-id>` matches
 * the original async-dispatched `Agent` tool_use. This is the AUTHORITATIVE
 * completion signal for `run_in_background: true` subagents (verified
 * 30/33 dispatches in session 23ba0306 — the 3 unmatched were still
 * running at session close).
 *
 * Notifications appear in two event forms — both carry the same payload:
 *   - `queue-operation` with `content` set to a `<task-notification>…` string
 *   - `user` event with `message.content` set to the same string
 */
export function findTaskNotificationForToolUseId(
  events: readonly SessionEvent[],
  toolUseId: string,
): { timestamp: string; isError: boolean } | null {
  const marker = `<tool-use-id>${toolUseId}</tool-use-id>`;
  for (const e of events) {
    let raw: unknown;
    if (e.type === "user" && !e.isSidechain) {
      raw = (e as UserEvent).message?.content;
    } else if (e.type === "queue-operation") {
      raw = (e as QueueOperationEvent).content;
    } else {
      continue;
    }
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (!text || !text.includes("<task-notification>")) continue;
    if (!text.includes(marker)) continue;
    // Conservative: treat notification presence as completed; explicit error
    // pattern detection deferred until we have a verified failure-case sample.
    return { timestamp: e.timestamp, isError: false };
  }
  return null;
}

/**
 * Find the completion signal for an async Agent dispatch.
 *
 * Priority:
 *   1. `<task-notification>` matching the dispatching tool_use.id —
 *      authoritative for `run_in_background: true` dispatches.
 *   2. tool_result whose content is NOT the "Async agent launched
 *      successfully" handshake — handles sync Agent dispatches and any
 *      future variant where the tool_result IS the real result.
 *
 * Returns null when only a dispatch-ack tool_result is present (subagent
 * is still running).
 */
export function findAgentCompletion(
  events: readonly SessionEvent[],
  toolUseId: string,
): { timestamp: string; isError: boolean } | null {
  const notif = findTaskNotificationForToolUseId(events, toolUseId);
  if (notif) return notif;

  // Fallback: tool_result that isn't a dispatch ack.
  for (const e of events) {
    if (e.type !== "user") continue;
    if (e.isSidechain) continue;
    const content = (e as UserEvent).message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (typeof c !== "object" || c === null) continue;
      if ((c as { type?: string }).type !== "tool_result") continue;
      if ((c as { tool_use_id?: string }).tool_use_id !== toolUseId) continue;
      if (isAsyncDispatchAck(c)) continue; // dispatch handle, not a completion
      return {
        timestamp: e.timestamp,
        isError: !!(c as { is_error?: boolean }).is_error,
      };
    }
  }
  return null;
}

/**
 * Walk main `user` events for a `tool_result` block matching `toolUseId`.
 * Phase 3: extracted helper used by both `hasParentToolResultAck` (real-agent
 * acknowledgment chain) and the synthetic-agent short-circuit in `isAgentCompleted`.
 *
 * Skips sidechain user events (those don't carry parent acks).
 */
export function findToolResultForId(
  events: readonly SessionEvent[],
  toolUseId: string,
): { timestamp: string; isError: boolean } | null {
  for (const e of events) {
    if (e.type !== "user") continue;
    if (e.isSidechain) continue;
    const content = (e as UserEvent).message.content;
    if (!Array.isArray(content)) continue;
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
  // Phase 3: synthetic agents have no own events.
  // Phase 3 → fixed: tool_result fires within ~300ms of an async Agent
  // dispatch as a HANDLE, not a completion. Use `findAgentCompletion` which
  // prefers the authoritative `<task-notification>` event and ignores
  // dispatch-ack tool_results.
  if (isSyntheticAgentId(agentId)) {
    const toolUseId = syntheticToToolUseId(agentId);
    if (!toolUseId) return false;
    return findAgentCompletion(events, toolUseId) !== null;
  }

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
 * structured `parent_tool_use_id` field (sdk.d.ts:2493 / :3229). This is
 * authoritative when present and replaces the 5-second temporal-proximity
 * heuristic that the legacy path (`dispatchingToolUseIdsTemporal`) uses for
 * historical JSONL sessions where the field is stripped.
 *
 * Returns the set of `tool_use.id` values that dispatched events for
 * `targetAgentId`. Empty set ⇒ no event owned by the target carries a
 * structured field; caller falls back to the temporal scan.
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
  // scan entirely — the structured path is correct even when JSONL flush
  // timing pushes the sidechain past the 5-second temporal window.
  const structured = dispatchersFromStructuredField(targetAgentId, events);
  if (structured.size > 0) return structured;

  // Fallback: temporal-proximity scan for historical JSONL sessions that
  // lack the structured field. Walk main assistant events in order; for each
  // Task/Agent tool_use, attribute the next available sidechain-agentId
  // within DISPATCH_WINDOW_MS.
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
