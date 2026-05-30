import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import type { SessionInfo, SessionEvent, RepoGroup } from "../types.js";
import { parseJsonlFile } from "./jsonl-reader.js";
import { SessionCache } from "../cache/session-cache.js";
import { parserLog } from "../logger.js";
import { collectorBuffer } from "../collector/buffer.js";
import {
  findDaemonSessionsBySessionId,
  type DaemonSession,
} from "./daemon-session-discovery.js";

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

export function getClaudeProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

/**
 * Pure overlay helper — produces a NEW SessionInfo array with daemon
 * pid/status/bridgeSessionId/daemonAlive merged in from
 * `~/.claude/sessions/<pid>.json`. Never mutates the input array or its
 * SessionInfo entries (invariant: `sessionCache` returns shared refs;
 * mutating them would leak daemon state across cache reads).
 *
 * Selection rule when multiple daemon entries share a sessionId
 * (e.g. session resumed across processes — `cli` then `sdk-cli`): prefer the
 * `alive` entry. When none are alive, fall back to the first one so callers
 * can surface `daemonAlive=false` and choose to fall through to mtime.
 *
 * Exported for test isolation — injecting a fake `lookup` keeps the suite
 * fast and deterministic by avoiding both the real filesystem and the
 * `daemon-session-discovery` module-level cache.
 */
export function enrichSessionsWithDaemon(
  sessions: SessionInfo[],
  lookup: (sessionId: string) => DaemonSession[],
): SessionInfo[] {
  return sessions.map((session) => {
    const matches = lookup(session.id);
    if (matches.length === 0) return session;
    const chosen = matches.find((d) => d.alive) ?? matches[0];
    return {
      ...session,
      pid: chosen.pid,
      daemonStatus: chosen.status,
      bridgeSessionId: chosen.bridgeSessionId,
      daemonAlive: chosen.alive,
    };
  });
}

export function discoverSessions(): SessionInfo[] {
  if (discoveryCache && Date.now() - discoveryCache.timestamp < DISCOVERY_TTL_MS) {
    return discoveryCache.sessions;
  }

  const projectsDir = getClaudeProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const rawSessions: SessionInfo[] = [];

  for (const projectHash of readdirSync(projectsDir)) {
    const projectDir = join(projectsDir, projectHash);
    if (!statSync(projectDir).isDirectory()) continue;

    for (const file of readdirSync(projectDir)) {
      if (!file.endsWith(".jsonl")) continue;

      const filePath = join(projectDir, file);
      const info = sessionCache.getSessionInfo(filePath, projectHash);
      if (info) {
        rawSessions.push(info);
      }
    }
  }

  // Sort by most recent first
  rawSessions.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  // Merge collector-sourced sessions (remote/docker)
  const collectorSessions = collectorBuffer.getSessions();
  for (const cs of collectorSessions) {
    if (!rawSessions.find((s) => s.id === cs.id)) {
      rawSessions.push(cs);
    }
  }

  // Overlay daemon state from ~/.claude/sessions/<pid>.json without
  // mutating the cached SessionInfo refs. Accepted trade-off: daemonAlive
  // can be up to DISCOVERY_TTL_MS (2s) stale because the enriched array
  // itself is cached — process death within that window won't flip the
  // flag until the next cache miss.
  const sessions = enrichSessionsWithDaemon(
    rawSessions,
    findDaemonSessionsBySessionId,
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
 * Group SessionInfo records into RepoGroup entries.
 *
 * Pure function — exported so tests can drive it with fixture data without
 * touching the filesystem. `discoverRepoGroups()` composes it with
 * `discoverSessions()`.
 *
 * Contract: `sessions` is expected to be sorted newest-first (matches
 * `discoverSessions()` output). This ordering is what makes "the newest
 * session's gitBranch wins" correct.
 *
 * Grouping strategy:
 *  - Pass 1: sessions with populated `cwd` are grouped by their resolved git
 *    repo root (handles worktrees — see `resolveRepoRoot`).
 *  - Pass 2: sessions without `cwd` are merged into an existing group when
 *    their `projectHash` (the path-with-slashes-replaced-with-hyphens Claude
 *    Code uses as its directory name) encodes to a known key; otherwise they
 *    form their own group keyed by `projectHash`.
 *
 *    NOTE: we deliberately do NOT attempt to decode the `projectHash` back
 *    into a path by replacing `-` with `/`. That transformation is lossy for
 *    folder names that legitimately contain hyphens (e.g. `conny-com-app`
 *    would decode to `.../conny/com/app`, and `basename()` would return
 *    `"app"`). Using the raw `projectHash` as the key preserves grouping
 *    correctness; the display name may look slightly ugly for truly
 *    no-cwd sessions, but that is honest rather than wrong.
 */
export function groupSessionsIntoRepos(sessions: SessionInfo[]): RepoGroup[] {
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

  // Dedupe the "no-cwd fallback" log: we only want to emit once per
  // projectHash per invocation. With the backward tail scan, every real
  // session should have a cwd; this path should be near-zero in practice.
  // If it does fire, repeating it per session buries signal in noise.
  const loggedFallbackHashes = new Set<string>();

  // Second pass: sessions without cwd — try to merge into an existing group.
  for (const session of sessions) {
    if (session.cwd) continue;
    const canonical = encodedKeyMap.get(session.projectHash);
    if (canonical) {
      // Merge into the already-known repo group
      repoMap.get(canonical)!.push(session);
    } else {
      // Truly unknown path — no session in this projectHash ever recorded a
      // cwd. Group by projectHash (unique, non-lossy) and let basename()
      // produce whatever it produces. Demoted to `debug` because after the
      // backward tail scan this is expected to be rare/absent in practice.
      if (!loggedFallbackHashes.has(session.projectHash)) {
        loggedFallbackHashes.add(session.projectHash);
        parserLog.debug(
          { projectHash: session.projectHash, sessionId: session.id },
          "discoverRepoGroups: session has no cwd and no matching canonical path; using projectHash as group key"
        );
      }
      if (!repoMap.has(session.projectHash)) {
        repoMap.set(session.projectHash, []);
      }
      repoMap.get(session.projectHash)!.push(session);
    }
  }

  const repos: RepoGroup[] = [];
  for (const [cwd, repoSessions] of repoMap) {
    const hasActiveSessions = repoSessions.some((s) => s.isActive);
    const lastActive = repoSessions[0]?.lastModified || "";
    // Prefer the newest session's branch (sessions are sorted newest-first).
    // Fall back to any session's branch only if the newest is missing the
    // field entirely — this preserves behavior for the edge case where the
    // current session hasn't yet emitted an event carrying gitBranch.
    const newestBranch = repoSessions[0]?.gitBranch;
    const gitBranch = newestBranch ?? repoSessions.find((s) => s.gitBranch)?.gitBranch;

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

export function discoverRepoGroups(): RepoGroup[] {
  if (repoGroupsCache && Date.now() - repoGroupsCache.timestamp < DISCOVERY_TTL_MS) {
    return repoGroupsCache.groups;
  }

  const repos = groupSessionsIntoRepos(discoverSessions());
  repoGroupsCache = { groups: repos, timestamp: Date.now() };
  return repos;
}

export function loadFullSession(sessionInfo: SessionInfo): {
  mainEvents: SessionEvent[];
  subagentEvents: Map<string, SessionEvent[]>;
  subagentMeta: Map<string, { agentType: string; description: string }>;
} {
  const subagentEvents = new Map<string, SessionEvent[]>();
  const subagentMeta = new Map<
    string,
    { agentType: string; description: string }
  >();

  // A session's files can appear under multiple projectHash directories when
  // the user's cwd changes mid-session (e.g. switching from the main repo into
  // a `.claude/worktrees/*` worktree). Claude Code writes subagent events into
  // whichever projectHash was active at the time, so subagents for a single
  // logical session are scattered across dirs. We must scan ALL project dirs
  // for `{projectDir}/{sessionId}/subagents/` to see the full set.
  //
  // Additionally the `{sessionId}.jsonl` main file can exist as a one-line
  // stub in one dir and the full content in another. Prefer the largest.
  const claudeProjectsDir = getClaudeProjectsDir();
  let mainJsonlPath = sessionInfo.path;
  let mainJsonlSize = existsSync(mainJsonlPath) ? statSync(mainJsonlPath).size : 0;

  if (existsSync(claudeProjectsDir)) {
    const projectDirs = readdirSync(claudeProjectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const projectDir of projectDirs) {
      const projectDirPath = join(claudeProjectsDir, projectDir);

      // Main JSONL upgrade: prefer the largest `{sessionId}.jsonl` across
      // project dirs. Subagent agentIds are unique hex strings so merging
      // maps across dirs is collision-free; main files are a single path.
      const siblingMainPath = join(projectDirPath, `${sessionInfo.id}.jsonl`);
      if (existsSync(siblingMainPath) && siblingMainPath !== mainJsonlPath) {
        const siblingSize = statSync(siblingMainPath).size;
        if (siblingSize > mainJsonlSize) {
          mainJsonlPath = siblingMainPath;
          mainJsonlSize = siblingSize;
        }
      }

      // Subagents: merge every `agent-*` transcript under
      // `{projectDir}/{sessionId}/subagents/`, RECURSING into nested dirs.
      // Workflow-dispatched agents live in `subagents/workflows/<wf-id>/`,
      // so a non-recursive scan silently dropped them from the graph. Only
      // files whose basename starts with `agent-` are agents; bookkeeping
      // files like `journal.jsonl` are skipped.
      const subagentDir = join(projectDirPath, sessionInfo.id, "subagents");
      if (!existsSync(subagentDir)) continue;

      const stack: string[] = [subagentDir];
      while (stack.length > 0) {
        const dir = stack.pop() as string;
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          continue; // unreadable dir — skip, never crash discovery
        }
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!entry.name.startsWith("agent-")) continue;
          if (entry.name.endsWith(".jsonl")) {
            const agentId = entry.name.replace(".jsonl", "").replace("agent-", "");
            subagentEvents.set(agentId, parseJsonlFile(full));
          } else if (entry.name.endsWith(".meta.json")) {
            const agentId = entry.name.replace(".meta.json", "").replace("agent-", "");
            try {
              const meta = JSON.parse(readFileSync(full, "utf-8"));
              subagentMeta.set(agentId, {
                agentType: meta.agentType || agentId,
                description: meta.description || agentId,
              });
            } catch {
              // ignore malformed meta
            }
          }
        }
      }
    }
  }

  // Infer agent type from filename for agents without .meta.json.
  // Claude Code internal agents use pattern: agent-a<type>-<hex>.jsonl
  // e.g. agent-acompact-4787973a.jsonl → type "compact".
  // Runs once over the fully-merged map so partial project-dir scans don't
  // produce premature or duplicate inferences.
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

  const mainEvents = parseJsonlFile(mainJsonlPath);

  return { mainEvents, subagentEvents, subagentMeta };
}
