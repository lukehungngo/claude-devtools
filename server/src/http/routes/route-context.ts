import { homedir } from "node:os";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { MetricsCache } from "../../cache/metrics-cache.js";
import type { ServerState } from "../server.js";

/** Shared metrics cache -- avoids re-parsing + re-computing metrics for unchanged files. */
export const metricsCache = new MetricsCache({ maxEntries: 50, ttlMs: 60_000 });

/** Context passed to each route sub-module */
export interface RouteContext {
  state?: ServerState;
}

/** Check if a path exists (async) */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Read settings.json safely, returning empty object on missing/invalid */
export async function readSettingsJson(): Promise<Record<string, unknown>> {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  try {
    const content = await readFile(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/** Write settings.json, creating ~/.claude/ if needed */
export async function writeSettingsJson(data: Record<string, unknown>): Promise<void> {
  const claudeDir = join(homedir(), ".claude");
  await mkdir(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, "settings.json");
  await writeFile(settingsPath, JSON.stringify(data, null, 2), "utf-8");
}
