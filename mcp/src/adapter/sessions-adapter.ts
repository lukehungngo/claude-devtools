import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { loadConfig } from "../config.js";
import { cutoffMs, type TimeRange } from "../range.js";

export interface SessionSummary {
  id: string;
  projectHash: string;
  path: string;
  lastModified: string;
  eventCount: number;
  /** File size in bytes — proxy for session length without full parse */
  sizeBytes: number;
}

export interface ListArgs {
  range: TimeRange;
  project?: string;
  limit?: number;
}

/**
 * Discovers sessions by walking <projectsDir>/<projectHash>/<id>.jsonl.
 * Lightweight — uses stat only, no event parsing.
 */
export function listSessions(args: ListArgs): SessionSummary[] {
  const cfg = loadConfig();
  const { projectsDir } = cfg;

  if (!existsSync(projectsDir)) return [];

  const cutoff = cutoffMs(args.range, Date.now());
  const sessions: SessionSummary[] = [];

  for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectHash = entry.name;

    if (args.project && projectHash !== args.project) continue;

    const projectDir = join(projectsDir, projectHash);
    for (const file of readdirSync(projectDir)) {
      if (!file.endsWith(".jsonl")) continue;
      const filePath = join(projectDir, file);
      const stat = statSync(filePath);
      const lastModified = stat.mtime.toISOString();
      const lastModifiedMs = stat.mtime.getTime();

      if (lastModifiedMs < cutoff) continue;

      // Estimate event count from file size (avg ~500 bytes per event)
      const eventCount = Math.max(1, Math.round(stat.size / 500));

      sessions.push({
        id: basename(file, ".jsonl"),
        projectHash,
        path: filePath,
        lastModified,
        eventCount,
        sizeBytes: stat.size,
      });
    }
  }

  // Sort by lastModified descending
  sessions.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
  );

  if (args.limit) return sessions.slice(0, args.limit);
  return sessions;
}
