import { readFileSync, existsSync } from "node:fs";
import type { SessionEvent } from "../types.js";

export function parseJsonlFile(filePath: string): SessionEvent[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const events: SessionEvent[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as SessionEvent;
      events.push(event);
    } catch {
      // Skip malformed lines — fail safe per architecture invariant
      continue;
    }
  }

  return events;
}

/**
 * Incremental reader: only parse lines after a given byte offset.
 * Returns new events + updated offset.
 */
export function parseJsonlIncremental(
  filePath: string,
  fromOffset: number
): { events: SessionEvent[]; newOffset: number } {
  if (!existsSync(filePath)) return { events: [], newOffset: fromOffset };

  const content = readFileSync(filePath, "utf-8");
  const newContent = content.slice(fromOffset);
  const events: SessionEvent[] = [];

  for (const line of newContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as SessionEvent);
    } catch {
      continue;
    }
  }

  return { events, newOffset: content.length };
}
