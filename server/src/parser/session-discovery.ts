import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SessionInfo, SessionEvent } from "../types.js";
import { parseJsonlFile } from "./jsonl-reader.js";

function getClaudeProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

export function discoverSessions(): SessionInfo[] {
  const projectsDir = getClaudeProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const sessions: SessionInfo[] = [];

  for (const projectHash of readdirSync(projectsDir)) {
    const projectDir = join(projectsDir, projectHash);
    if (!statSync(projectDir).isDirectory()) continue;

    for (const file of readdirSync(projectDir)) {
      if (!file.endsWith(".jsonl")) continue;

      const sessionId = file.replace(".jsonl", "");
      const filePath = join(projectDir, file);
      const stat = statSync(filePath);

      // Count subagents
      const subagentDir = join(projectDir, sessionId, "subagents");
      let subagentCount = 0;
      if (existsSync(subagentDir)) {
        subagentCount = readdirSync(subagentDir).filter((f) =>
          f.endsWith(".jsonl")
        ).length;
      }

      // Count events (fast: count lines)
      const content = readFileSync(filePath, "utf-8");
      const eventCount = content.split("\n").filter((l) => l.trim()).length;

      // Get start time from first event
      const firstLine = content.split("\n").find((l) => l.trim());
      let startTime = stat.birthtime.toISOString();
      if (firstLine) {
        try {
          const first = JSON.parse(firstLine);
          if (first.timestamp) startTime = first.timestamp;
        } catch {
          // ignore
        }
      }

      sessions.push({
        id: sessionId,
        projectHash,
        path: filePath,
        startTime,
        lastModified: stat.mtime.toISOString(),
        eventCount,
        subagentCount,
      });
    }
  }

  // Sort by most recent first
  sessions.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  return sessions;
}

export function loadFullSession(sessionInfo: SessionInfo): {
  mainEvents: SessionEvent[];
  subagentEvents: Map<string, SessionEvent[]>;
  subagentMeta: Map<string, { agentType: string; description: string }>;
} {
  const mainEvents = parseJsonlFile(sessionInfo.path);

  const subagentEvents = new Map<string, SessionEvent[]>();
  const subagentMeta = new Map<
    string,
    { agentType: string; description: string }
  >();

  const subagentDir = join(
    getClaudeProjectsDir(),
    sessionInfo.projectHash,
    sessionInfo.id,
    "subagents"
  );

  if (existsSync(subagentDir)) {
    for (const file of readdirSync(subagentDir)) {
      if (file.endsWith(".jsonl")) {
        const agentId = file.replace(".jsonl", "").replace("agent-", "");
        subagentEvents.set(
          agentId,
          parseJsonlFile(join(subagentDir, file))
        );
      } else if (file.endsWith(".meta.json")) {
        const agentId = file
          .replace(".meta.json", "")
          .replace("agent-", "");
        try {
          const meta = JSON.parse(
            readFileSync(join(subagentDir, file), "utf-8")
          );
          subagentMeta.set(agentId, {
            agentType: meta.agentType || "unknown",
            description: meta.description || "",
          });
        } catch {
          // ignore
        }
      }
    }
  }

  return { mainEvents, subagentEvents, subagentMeta };
}
