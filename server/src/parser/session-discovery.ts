import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import type { SessionInfo, SessionEvent, RepoGroup } from "../types.js";
import { parseJsonlFile } from "./jsonl-reader.js";
import { SessionCache } from "../cache/session-cache.js";

/** Shared session cache instance — used by discoverSessions(). */
export const sessionCache = new SessionCache();

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

      const filePath = join(projectDir, file);
      const info = sessionCache.getSessionInfo(filePath, projectHash);
      if (info) {
        sessions.push(info);
      }
    }
  }

  // Sort by most recent first
  sessions.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  return sessions;
}


/**
 * Resolve the git repo root from a working directory.
 * Handles both normal repos (.git is a directory) and
 * worktrees (.git is a file pointing to the main repo).
 */
function resolveRepoRoot(cwd: string): string {
  let dir = cwd;
  const root = "/";
  while (dir !== root) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) {
      try {
        const stat = statSync(gitPath);
        if (stat.isFile()) {
          // Worktree: .git file contains "gitdir: /path/to/repo/.git/worktrees/name"
          const gitFileContent = readFileSync(gitPath, "utf-8").trim();
          const match = gitFileContent.match(/^gitdir:\s+(.+)$/);
          if (match) {
            const gitdir = match[1];
            const worktreesIdx = gitdir.indexOf("/.git/worktrees/");
            if (worktreesIdx !== -1) {
              return gitdir.substring(0, worktreesIdx);
            }
          }
        }
      } catch {
        // Fall through to return dir as-is
      }
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd; // Fallback: couldn't find .git
}

export function discoverRepoGroups(): RepoGroup[] {
  const sessions = discoverSessions();
  const repoMap = new Map<string, SessionInfo[]>();

  for (const session of sessions) {
    const key = session.cwd ? resolveRepoRoot(session.cwd) : session.projectHash;
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
