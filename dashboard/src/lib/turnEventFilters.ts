import type { SessionEvent } from "./types";

/**
 * Returns only main-thread events (excludes sidechain subagent events).
 * Use this when deriving TURN-level facts from the merged event stream —
 * turn status, turn metrics, turn-boundary scans, etc.
 *
 * A raw events array is the chronological merge of main (non-sidechain)
 * events and subagent (sidechain) events from the subagent JSONL files.
 * Any reducer that decides something about the TURN must filter to main
 * events only — a subagent's stop_reason or tool_use does not vote on
 * the parent turn.
 */
export function mainEventsOnly(events: readonly SessionEvent[]): SessionEvent[] {
  return events.filter((e) => !e.isSidechain);
}

/**
 * Returns only events owned by the given agentId.
 *
 * - agentId === "main" matches on `!isSidechain`. The sidechain flag is the
 *   reliable ownership invariant for main-thread events; `agentId` absence is
 *   not checked because main events carry no agentId in production.
 * - Any other agentId matches events with that exact agentId.
 *
 * Use this when deriving a single agent's lastEvent, token totals, tool
 * counts, or status from the merged stream.
 *
 * Reserved for future per-agent reducers; no current production consumer.
 * Exported so future reducers can route through it from day one and keep
 * ownership vocabulary complete alongside `mainEventsOnly()`.
 */
export function eventsForAgent(
  events: readonly SessionEvent[],
  agentId: string,
): SessionEvent[] {
  if (agentId === "main") {
    return events.filter((e) => !e.isSidechain);
  }
  return events.filter((e) => e.agentId === agentId);
}
