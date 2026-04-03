import { readFileSync, existsSync, openSync, fstatSync, readSync, closeSync } from "node:fs";
import type { SessionEvent } from "../types.js";
import { parserLog } from "../logger.js";

/**
 * Event types that are NOT session conversation events (metadata, snapshots, bookmarks).
 * We skip these to avoid inflating event counts and confusing the parser.
 * Everything else is passed through — the SDK may add new event types and we should not
 * silently drop them.
 */
const IGNORED_EVENT_TYPES = new Set([
  "file-history-snapshot",
  "last-prompt",
  "pr-link",
]);

function isRelevantEvent(parsed: Record<string, unknown>): boolean {
  const type = parsed.type;
  if (typeof type !== "string") return false;
  return !IGNORED_EVENT_TYPES.has(type);
}

export function parseJsonlFile(filePath: string): SessionEvent[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const events: SessionEvent[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (!isRelevantEvent(parsed)) continue;
      events.push(parsed as unknown as SessionEvent);
    } catch (err) {
      // Skip malformed lines — fail safe per architecture invariant
      parserLog.warn({ filePath, error: String(err) }, "parseJsonlFile: skipped malformed line");
      continue;
    }
  }

  return events;
}

/**
 * Incremental reader: only parse lines after a given byte offset.
 * Uses targeted byte-range reading to avoid re-reading the entire file.
 * Returns new events + updated byte offset.
 */
export function parseJsonlIncremental(
  filePath: string,
  fromOffset: number
): { events: SessionEvent[]; newOffset: number } {
  if (!existsSync(filePath)) return { events: [], newOffset: fromOffset };

  const fd = openSync(filePath, "r");
  try {
    const stat = fstatSync(fd);
    const bytesToRead = stat.size - fromOffset;

    if (bytesToRead <= 0) {
      return { events: [], newOffset: fromOffset };
    }

    const buffer = Buffer.alloc(bytesToRead);
    readSync(fd, buffer, 0, bytesToRead, fromOffset);
    const newContent = buffer.toString("utf-8");
    const events: SessionEvent[] = [];

    for (const line of newContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (!isRelevantEvent(parsed)) continue;
        events.push(parsed as unknown as SessionEvent);
      } catch (err) {
        // Skip malformed lines — fail safe per architecture invariant
        parserLog.warn({ filePath, fromOffset, error: String(err) }, "parseJsonlIncremental: skipped malformed line");
        continue;
      }
    }

    return { events, newOffset: stat.size };
  } finally {
    closeSync(fd);
  }
}
