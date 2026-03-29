import type { TurnSnapshot } from "./turnSnapshot";

/**
 * Pre-compute searchable text for each turn.
 * Returns a Map from turnNumber to a single lowercase string containing
 * all searchable content (prompt text + event content).
 */
export function buildSearchIndex(turns: TurnSnapshot[]): Map<number, string> {
  const index = new Map<number, string>();
  for (const turn of turns) {
    index.set(turn.turnNumber, buildTurnSearchText(turn));
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
): Map<number, string> {
  const updated = new Map(existing);
  for (const turn of changedTurns) {
    updated.set(turn.turnNumber, buildTurnSearchText(turn));
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

function buildTurnSearchText(turn: TurnSnapshot): string {
  const parts: string[] = [];

  // Prompt text
  if (turn.promptText) {
    parts.push(turn.promptText);
  }

  // Event content
  for (const event of turn.events) {
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
