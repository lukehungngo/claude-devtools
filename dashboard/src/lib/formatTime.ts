/**
 * Shared time formatting utilities.
 * Extracted from TurnCard.tsx, SnapshotTabs.tsx, and AgentLogs.tsx
 * to eliminate duplication (audit item P3 #12).
 */

/** Format timestamp as HH:MM:SS (24h) */
export function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

/** Format timestamp as HH:MM (24h, no seconds) */
export function formatTimeShort(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
