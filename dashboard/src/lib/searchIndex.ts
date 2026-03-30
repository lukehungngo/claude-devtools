import type { TurnSnapshot } from "./turnSnapshot";
import { getEventsForTurn } from "./turnSnapshot";
import type { SessionEvent } from "./types";

/**
 * Pre-compute searchable text for each turn.
 * Returns a Map from turnNumber to a single lowercase string containing
 * all searchable content (prompt text + event content).
 */
export function buildSearchIndex(turns: TurnSnapshot[], allEvents: SessionEvent[]): Map<number, string> {
  const index = new Map<number, string>();
  for (const turn of turns) {
    index.set(turn.turnNumber, buildTurnSearchText(turn, allEvents));
  }
  return index;
}

/**
 * Incrementally update the search index with new/changed turns.
 * Existing entries for turns not in the update list are preserved.
 */
export function updateSearchIndex(
  existing: Map<number, string>,
  changedTurns: TurnSnapshot[],
  allEvents: SessionEvent[],
): Map<number, string> {
  const updated = new Map(existing);
  for (const turn of changedTurns) {
    updated.set(turn.turnNumber, buildTurnSearchText(turn, allEvents));
  }
  return updated;
}

/**
 * Filter turns by query using the pre-built search index.
 * Returns all turns when query is empty/whitespace.
 */
export function filterTurnsByQuery(
  turns: TurnSnapshot[],
  index: Map<number, string>,
  query: string,
): TurnSnapshot[] {
  const q = query.trim().toLowerCase();
  if (!q) return turns;
  return turns.filter((turn) => {
    const text = index.get(turn.turnNumber);
    return text ? text.includes(q) : false;
  });
}

function buildTurnSearchText(turn: TurnSnapshot, allEvents: SessionEvent[]): string {
  const parts: string[] = [];

  // Prompt text
  if (turn.promptText) {
    parts.push(turn.promptText);
  }

  // Event content
  const turnEvents = getEventsForTurn(turn, allEvents);
  for (const event of turnEvents) {
    if (event.type === "assistant" || event.type === "user") {
      const msg = (event as { message?: { content?: unknown } }).message;
      if (typeof msg?.content === "string") {
        parts.push(msg.content);
      } else if (Array.isArray(msg?.content)) {
        for (const item of msg.content) {
          if (typeof item === "object" && item !== null && "text" in item) {
            parts.push((item as { text: string }).text);
          }
        }
      }
    }
  }

  return parts.join(" ").toLowerCase();
}
