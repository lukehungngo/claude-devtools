import type { LogEntry, TimelineGroup } from "../components/AgentLogs";

interface ExportGroup {
  agentId: string;
  agentType: string;
  depth: number;
  entryCount: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  cost: number;
}

interface ExportPayload {
  exportedAt: string;
  totalEntries: number;
  totalGroups: number;
  entries: LogEntry[];
  groups: ExportGroup[];
}

/**
 * Serialize Agent Log entries and timeline groups to a JSON string suitable
 * for export or debugging. Groups are mapped to a flat summary (no nested
 * entries array) so the output stays readable.
 */
export function buildExportPayload(
  entries: LogEntry[],
  groups: TimelineGroup[]
): string {
  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    totalGroups: groups.length,
    entries,
    groups: groups.map((g) => ({
      agentId: g.agentId,
      agentType: g.agentType,
      depth: g.depth,
      entryCount: g.entries.length,
      startTime: g.startTime,
      endTime: g.endTime,
      durationMs: g.durationMs,
      cost: g.cost,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Trigger a browser file download for JSON content.
 * Creates an object URL, clicks a synthetic anchor, then revokes the URL.
 */
export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
