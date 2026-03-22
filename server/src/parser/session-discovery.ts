import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SessionInfo, SessionEvent, RepoGroup } from "../types.js";
import { parseJsonlFile } from "./jsonl-reader.js";

const ACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

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

      // Read file content for event count and metadata extraction
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      const eventCount = lines.length;

      // Extract metadata from first few events
      let startTime = stat.birthtime.toISOString();
      let cwd: string | undefined;
      let gitBranch: string | undefined;
      let permissionMode: string | undefined;
      let model: string | undefined;

      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        try {
          const evt = JSON.parse(lines[i]);
          if (i === 0 && evt.timestamp) startTime = evt.timestamp;
          if (evt.cwd && !cwd) cwd = evt.cwd;
          if (evt.gitBranch && !gitBranch) gitBranch = evt.gitBranch;
          if (evt.permissionMode && !permissionMode) permissionMode = evt.permissionMode;
          if (evt.message?.model && !model) model = evt.message.model;
        } catch {
          // skip malformed lines
        }
      }

      // Also check last few events for model (assistant events come later)
      if (!model) {
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
          try {
            const evt = JSON.parse(lines[i]);
            if (evt.message?.model) {
              model = evt.message.model;
              break;
            }
          } catch {
            // skip
          }
        }
      }

      const isActive =
        Date.now() - new Date(stat.mtime).getTime() < ACTIVE_THRESHOLD_MS;

      sessions.push({
        id: sessionId,
        projectHash,
        path: filePath,
        startTime,
        lastModified: stat.mtime.toISOString(),
        eventCount,
        subagentCount,
        cwd,
        gitBranch,
        permissionMode,
        model,
        isActive,
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

export function discoverRepoGroups(): RepoGroup[] {
  const sessions = discoverSessions();
  const repoMap = new Map<string, SessionInfo[]>();

  for (const session of sessions) {
    const key = session.cwd || session.projectHash;
    if (!repoMap.has(key)) {
      repoMap.set(key, []);
    }
    repoMap.get(key)!.push(session);
  }

  const repos: RepoGroup[] = [];
  for (const [cwd, repoSessions] of repoMap) {
    const hasActiveSessions = repoSessions.some((s) => s.isActive);
    const lastActive = repoSessions[0]?.lastModified || "";
    const gitBranch = repoSessions.find((s) => s.gitBranch)?.gitBranch;

    repos.push({
      cwd,
      repoName: basename(cwd),
      gitBranch,
      sessions: repoSessions,
      lastActive,
      hasActiveSessions,
    });
  }

  // Sort: repos with active sessions first, then by last active
  repos.sort((a, b) => {
    if (a.hasActiveSessions !== b.hasActiveSessions) {
      return a.hasActiveSessions ? -1 : 1;
    }
    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
  });

  return repos;
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
