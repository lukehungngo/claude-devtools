import type { AgentLogEntry } from "./types";

/**
 * The agent's meaningful log lines, in chronological order, with NO cap — the
 * Graph tab's log panel shows the FULL log (not a "last N" slice). Entries with
 * no renderable content (empty `content` and empty `contentPreview`) are
 * dropped so structural/no-op events don't show as blank rows.
 *
 * Pure + fail-safe: never throws.
 */
export function meaningfulLogLines(logs: AgentLogEntry[]): AgentLogEntry[] {
  return logs.filter((l) => ((l.content || l.contentPreview) ?? "").trim().length > 0);
}

/** The renderable full text for a log entry (full content, preview fallback). */
export function logLineText(entry: AgentLogEntry): string {
  return entry.content && entry.content.trim().length > 0 ? entry.content : entry.contentPreview;
}
