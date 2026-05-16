import os from "node:os";
import path from "node:path";

export interface McpConfig {
  projectsDir: string;
  payloadCapBytes: number;
  maxEventsPerCall: number;
  cacheCapacity: number;
}

export function loadConfig(): McpConfig {
  const projectsDir =
    process.env.CLAUDE_PROJECTS_DIR ??
    path.join(os.homedir(), ".claude", "projects");
  return {
    projectsDir,
    payloadCapBytes: Number(process.env.MCP_PAYLOAD_CAP ?? 200_000),
    maxEventsPerCall: Number(process.env.MCP_MAX_EVENTS ?? 100_000),
    cacheCapacity: Number(process.env.MCP_CACHE_CAP ?? 25),
  };
}
