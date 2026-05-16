import { readFileSync, existsSync, openSync, fstatSync, readSync, closeSync } from "node:fs";
import type { SessionEvent } from "../types.js";
import { parserLog } from "../logger.js";

/**
 * Sidecar metadata records that are NOT conversation events. These persist
 * session-level state (titles, last prompts, file snapshots, worktree state,
 * permission-mode changes) in the same JSONL stream. Excluded from the event
 * array so counts/UI stay accurate.
 *
 * See docs/spec/cc-parity-gaps.md P0-4 for the full catalog observed in
 * `~/.claude/projects/` JSONLs (CC v2.1.143).
 */
const IGNORED_EVENT_TYPES = new Set([
  "ai-title",
  "file-history-snapshot",
  "last-prompt",
  "permission-mode",
  "pr-link",
  "worktree-state",
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
