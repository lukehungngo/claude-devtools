import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import type { SessionInfo, SessionEvent, RepoGroup } from "../types.js";
import { parseJsonlFile } from "./jsonl-reader.js";
import { SessionCache } from "../cache/session-cache.js";

/** Shared session cache instance — used by discoverSessions(). */
export const sessionCache = new SessionCache();

/** TTL cache for discoverSessions() — avoids stat storms on rapid API calls. */
const DISCOVERY_TTL_MS = 2_000;
let discoveryCache: { sessions: SessionInfo[]; timestamp: number } | null = null;
let repoGroupsCache: { groups: RepoGroup[]; timestamp: number } | null = null;

/** Invalidate both discovery caches, forcing the next call to re-scan. */
export function invalidateDiscoveryCache(): void {
  discoveryCache = null;
  repoGroupsCache = null;
}

function getClaudeProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

export function discoverSessions(): SessionInfo[] {
  if (discoveryCache && Date.now() - discoveryCache.timestamp < DISCOVERY_TTL_MS) {
    return discoveryCache.sessions;
  }

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

  discoveryCache = { sessions, timestamp: Date.now() };
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

/**
 * Decode a Claude Code projectHash back to an absolute path.
 * Claude Code encodes a path by replacing every "/" with "-":
 *   /Users/soh/working/eduquest  →  -Users-soh-working-eduquest
 * Reversing: restore the leading "-" to "/" then replace remaining "-" with "/".
 * Note: this is unambiguous only when directory names don't contain "-", which
 * is the common case. We use it only as a fallback lookup — we never display it.
 */
function decodeProjectHash(projectHash: string): string {
  if (!projectHash.startsWith("-")) return projectHash;
  return "/" + projectHash.slice(1).replace(/-/g, "/");
}

export function discoverRepoGroups(): RepoGroup[] {
  if (repoGroupsCache && Date.now() - repoGroupsCache.timestamp < DISCOVERY_TTL_MS) {
    return repoGroupsCache.groups;
  }

  const sessions = discoverSessions();
  const repoMap = new Map<string, SessionInfo[]>();

  // First pass: group sessions that have a cwd by their resolved git root.
  // This builds the authoritative set of known repo paths.
  for (const session of sessions) {
    if (!session.cwd) continue;
    const key = resolveRepoRoot(session.cwd);
    if (!repoMap.has(key)) repoMap.set(key, []);
    repoMap.get(key)!.push(session);
  }

  // Build a lookup: encoded repo path → canonical key, so sessions without cwd
  // can be merged into an existing group instead of creating a duplicate entry.
  // e.g. "/Users/soh/working/eduquest".replace(/\//g, "-") → "-Users-soh-working-eduquest"
  const encodedKeyMap = new Map<string, string>(); // encodedPath → canonicalKey
  for (const key of repoMap.keys()) {
    encodedKeyMap.set(key.replace(/\//g, "-"), key);
  }

  // Second pass: sessions without cwd — try to merge into an existing group.
  for (const session of sessions) {
    if (session.cwd) continue;
    const canonical = encodedKeyMap.get(session.projectHash);
    if (canonical) {
      // Merge into the already-known repo group
      repoMap.get(canonical)!.push(session);
    } else {
      // Truly unknown path — fall back to decoded hash as the key
      const decoded = decodeProjectHash(session.projectHash);
      if (!repoMap.has(decoded)) repoMap.set(decoded, []);
      repoMap.get(decoded)!.push(session);
    }
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

  repoGroupsCache = { groups: repos, timestamp: Date.now() };
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
            agentType: meta.agentType || agentId,
            description: meta.description || agentId,
          });
        } catch {
          // ignore
        }
      }
    }

    // Infer agent type from filename for agents without .meta.json.
    // Claude Code internal agents use pattern: agent-a<type>-<hex>.jsonl
    // e.g. agent-acompact-4787973a.jsonl → type "compact"
    for (const agentId of subagentEvents.keys()) {
      if (!subagentMeta.has(agentId)) {
        const match = agentId.match(/^a([a-z_]+)-[0-9a-f]+$/);
        const inferredType = match ? match[1] : agentId;
        subagentMeta.set(agentId, {
          agentType: inferredType,
          description: inferredType.replace(/_/g, " "),
        });
      }
    }
  }

  return { mainEvents, subagentEvents, subagentMeta };
}
