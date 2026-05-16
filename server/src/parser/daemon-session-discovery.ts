import { existsSync, readdirSync, readFileSync, statSync, type Stats } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parserLog } from "../logger.js";

/**
 * One entry per running (or recently-running) Claude Code daemon, sourced
 * from `~/.claude/sessions/<pid>.json`. Schema verified against CC 2.1.142+.
 *
 * `alive` is computed at read time via `process.kill(pid, 0)` and is NOT
 * persisted in the JSON file itself — it reflects whether the OS process
 * currently exists.
 */
export interface DaemonSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  updatedAt?: number;
  procStart?: string;
  version: string;
  peerProtocol?: number;
  kind?: "interactive" | "background" | string;
  entrypoint?: string;
  status?: "idle" | "busy" | string;
  bridgeSessionId?: string;
  /** True if `process.kill(pid, 0)` succeeded (process exists). */
  alive: boolean;
}

/** Resolves the on-disk directory holding daemon session files. */
function getDaemonSessionsDir(): string {
  return join(homedir(), ".claude", "sessions");
}

interface CacheEntry {
  session: DaemonSession;
  size: number;
  mtimeMs: number;
}

/**
 * Stat-based cache for daemon session files. Mirrors the SessionCache pattern:
 * a file's parsed result is reused as long as its (size, mtimeMs) tuple is
 * unchanged. The `alive` flag is recomputed on every read because the
 * underlying process may have exited even when the JSON file is untouched.
 */
const cache = new Map<string, CacheEntry>();

/** Test/internal helper: drop all cached entries. */
export function _clearDaemonSessionCache(): void {
  cache.clear();
}

/**
 * Returns true if the given OS pid currently exists. Uses signal 0 which
 * performs an existence check without delivering a signal. ESRCH means the
 * process is gone (stale daemon file); EPERM means it exists but we lack
 * permission to signal it — we treat that as alive.
 */
function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

/**
 * Parse one daemon session file. Returns `null` when the file is missing,
 * unreadable, contains malformed JSON, or lacks required fields. Errors are
 * logged at warn level and swallowed (invariant #3 — fail-safe parsing).
 */
function parseDaemonFile(
  filePath: string,
  stat: Stats,
): DaemonSession | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Required fields. Any missing → skip the file rather than guess.
    const pidVal = parsed["pid"];
    const sessionIdVal = parsed["sessionId"];
    const cwdVal = parsed["cwd"];
    const startedAtVal = parsed["startedAt"];
    const versionVal = parsed["version"];

    if (
      typeof pidVal !== "number" ||
      typeof sessionIdVal !== "string" ||
      typeof cwdVal !== "string" ||
      typeof startedAtVal !== "number" ||
      typeof versionVal !== "string"
    ) {
      parserLog.warn(
        { filePath, hasPid: typeof pidVal, hasSessionId: typeof sessionIdVal },
        "daemon-session-discovery: missing required field, skipping",
      );
      return null;
    }

    const pid = pidVal;
    const session: DaemonSession = {
      pid,
      sessionId: sessionIdVal,
      cwd: cwdVal,
      startedAt: startedAtVal,
      version: versionVal,
      alive: isPidAlive(pid),
    };

    // Optional fields — copy through with light type guards.
    if (typeof parsed["updatedAt"] === "number") {
      session.updatedAt = parsed["updatedAt"];
    }
    if (typeof parsed["procStart"] === "string") {
      session.procStart = parsed["procStart"];
    }
    if (typeof parsed["peerProtocol"] === "number") {
      session.peerProtocol = parsed["peerProtocol"];
    }
    if (typeof parsed["kind"] === "string") {
      session.kind = parsed["kind"];
    }
    if (typeof parsed["entrypoint"] === "string") {
      session.entrypoint = parsed["entrypoint"];
    }
    if (typeof parsed["status"] === "string") {
      session.status = parsed["status"];
    }
    if (typeof parsed["bridgeSessionId"] === "string") {
      session.bridgeSessionId = parsed["bridgeSessionId"];
    }

    cache.set(filePath, {
      session,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });

    return session;
  } catch (err) {
    parserLog.warn(
      { filePath, error: String(err) },
      "daemon-session-discovery: failed to parse daemon session file",
    );
    return null;
  }
}

/**
 * Read a daemon session file with stat-based cache. If the file's
 * (size, mtimeMs) match the cached entry, the cached parse result is reused —
 * but `alive` is always recomputed because the process may have exited
 * independently of any file write.
 */
function readDaemonFile(filePath: string): DaemonSession | null {
  let stat: Stats;
  try {
    stat = statSync(filePath);
  } catch {
    cache.delete(filePath);
    return null;
  }

  const cached = cache.get(filePath);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    return {
      ...cached.session,
      alive: isPidAlive(cached.session.pid),
    };
  }

  return parseDaemonFile(filePath, stat);
}

/**
 * Discover every daemon session recorded under `~/.claude/sessions/`.
 * Malformed and unreadable files are skipped. Returns an empty array when
 * the directory does not exist (e.g. CC has never been launched).
 */
export function listDaemonSessions(
  options?: { dir?: string },
): DaemonSession[] {
  const dir = options?.dir ?? getDaemonSessionsDir();
  if (!existsSync(dir)) return [];

  const sessions: DaemonSession[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    parserLog.warn(
      { dir, error: String(err) },
      "daemon-session-discovery: failed to read sessions dir",
    );
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = join(dir, entry);
    const session = readDaemonFile(filePath);
    if (session) sessions.push(session);
  }

  return sessions;
}

/** Look up a single daemon session by its OS pid. */
export function findDaemonSessionByPid(
  pid: number,
  options?: { dir?: string },
): DaemonSession | null {
  const dir = options?.dir ?? getDaemonSessionsDir();
  const filePath = join(dir, `${pid}.json`);
  const direct = readDaemonFile(filePath);
  if (direct) return direct;

  // Fall back to a full scan in case the file is named differently
  // (very rare — guards against future CC renaming the file).
  for (const session of listDaemonSessions({ dir })) {
    if (session.pid === pid) return session;
  }
  return null;
}

/**
 * Find every daemon session whose `sessionId` matches. Multiple matches are
 * possible when a session was resumed across processes (e.g. `cli` then
 * `sdk-cli`). Results are deduped by pid to avoid double-counting.
 */
export function findDaemonSessionsBySessionId(
  sessionId: string,
  options?: { dir?: string },
): DaemonSession[] {
  const seenPids = new Set<number>();
  const matches: DaemonSession[] = [];
  for (const session of listDaemonSessions(options)) {
    if (session.sessionId !== sessionId) continue;
    if (seenPids.has(session.pid)) continue;
    seenPids.add(session.pid);
    matches.push(session);
  }
  return matches;
}

/** Test helper: report which file basenames are currently cached. */
export function _cachedFileBasenames(): string[] {
  return [...cache.keys()].map((p) => basename(p));
}
