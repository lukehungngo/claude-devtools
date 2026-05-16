import { spawnSync } from "child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Router } from "express";
import {
  discoverSessions,
  discoverRepoGroups,
  loadFullSession,
} from "../../parser/session-discovery.js";
import { getAnthropicUsage } from "../../api/usage-client.js";
import { aggregateCosts } from "../../analyzer/cost-aggregator.js";
import {
  aggregatePerModelUsage,
  aggregateEventsPerModel,
} from "../../analyzer/usage-breakdown.js";
import type { SessionEvent } from "../../types.js";
import { logger } from "../../logger.js";
import { CommandCache } from "../../discovery/command-cache.js";
import type { RouteContext } from "./route-context.js";
import { RUNNING_THRESHOLD_MS } from "../../cache/session-cache.js";

/** Global command cache — survives across sessions, persisted to disk */
const commandCache = new CommandCache();

// Bootstrap in background (non-blocking) — filesystem scan is fast (<100ms)
setTimeout(() => commandCache.bootstrap(), 500);

// Fallback model list when SDK Query is not available
const FALLBACK_MODELS = [
  { value: "claude-opus-4-6", displayName: "Claude Opus 4", description: "Most capable model" },
  { value: "claude-sonnet-4-6", displayName: "Claude Sonnet 4", description: "Balanced performance" },
  { value: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", description: "Fastest model" },
];

// Fallback slash commands when SDK Query is not available.
// SDK supportedCommands() is authoritative — this list is used only as a last resort.
// Keep in sync with Claude Code CLI commands (see: sdk.d.ts SlashCommand type).
const FALLBACK_COMMANDS = [
  { name: "add-dir", description: "Add a directory to the session context", argumentHint: "<path>" },
  { name: "agents", description: "Show available subagents", argumentHint: "" },
  { name: "bug", description: "Report a bug", argumentHint: "" },
  { name: "clear", description: "Clear context (starts new session)", argumentHint: "" },
  { name: "compact", description: "Compact the conversation context", argumentHint: "" },
  { name: "context", description: "Show context window usage", argumentHint: "" },
  { name: "cost", description: "Show session cost summary", argumentHint: "" },
  { name: "diff", description: "Show git diff (uncommitted changes)", argumentHint: "" },
  { name: "doctor", description: "Run system diagnostics", argumentHint: "" },
  { name: "effort", description: "Set effort level", argumentHint: "<low|medium|high|xhigh|max>" },
  { name: "fast", description: "Toggle fast mode", argumentHint: "<on|off>" },
  { name: "help", description: "Show available commands", argumentHint: "" },
  { name: "hooks", description: "View configured hooks", argumentHint: "" },
  { name: "init", description: "Initialize CLAUDE.md in project", argumentHint: "" },
  { name: "login", description: "Log in to your Anthropic account", argumentHint: "" },
  { name: "logout", description: "Log out of your Anthropic account", argumentHint: "" },
  { name: "mcp", description: "Show connected MCP servers and tools", argumentHint: "" },
  { name: "memory", description: "View CLAUDE.md content", argumentHint: "" },
  { name: "model", description: "Show or switch model", argumentHint: "<model>" },
  { name: "output-style", description: "Set output style", argumentHint: "<concise|verbose|markdown>" },
  { name: "permissions", description: "Show permission mode and allowances", argumentHint: "" },
  { name: "plan", description: "Switch to plan mode (read-only)", argumentHint: "" },
  { name: "rename", description: "Rename the current session", argumentHint: "<name>" },
  { name: "resume", description: "Resume a previous session", argumentHint: "[session-id]" },
  { name: "review", description: "Review a PR or diff", argumentHint: "" },
  { name: "rewind", description: "Rewind conversation", argumentHint: "[N turns]" },
  { name: "settings", description: "View session settings", argumentHint: "" },
  { name: "shortcuts", description: "Show keyboard shortcuts", argumentHint: "" },
  { name: "stats", description: "Show usage statistics", argumentHint: "" },
  { name: "tasks", description: "Show task summary", argumentHint: "" },
  { name: "usage", description: "Show rate limit utilization", argumentHint: "" },
];

export function createDiscoveryRoutes({ state }: RouteContext): Router {
  const router = Router();

  // List repos grouped by cwd
  router.get("/repos", (_req, res) => {
    try {
      const repos = discoverRepoGroups();

      // Cross-reference with SessionManager for accurate isRunning status.
      // The JSONL mtime heuristic (2-min threshold) is unreliable — use the
      // actual in-memory session status as the source of truth.
      const sessionManager = state?.sessionManager;
      if (sessionManager) {
        const activeStatuses = new Map<string, string>();
        for (const s of sessionManager.getActiveSessions()) {
          activeStatuses.set(s.sessionId, s.status);
        }
        for (const repo of repos) {
          for (const session of repo.sessions) {
            const mgrStatus = activeStatuses.get(session.id);
            if (mgrStatus) {
              // Tier 1: In-memory SessionManager — most precise signal.
              session.isRunning = mgrStatus === "streaming" || mgrStatus === "waiting-permission";
            } else if (session.daemonAlive && session.daemonStatus) {
              // Tier 2: Daemon-authoritative status from
              // ~/.claude/sessions/<pid>.json. Only trust this when the OS
              // process is still alive — a stale daemon entry (alive=false)
              // must NOT claim "running" or "idle" and must fall through to
              // the mtime heuristic instead.
              session.isRunning = session.daemonStatus === "busy";
            } else {
              // Tier 3: mtime fallback (2-min window) for sessions that
              // neither SessionManager nor an alive daemon entry tracks.
              const ageMs = Date.now() - new Date(session.lastModified).getTime();
              session.isRunning = ageMs < RUNNING_THRESHOLD_MS;
            }
          }
          repo.hasActiveSessions = repo.sessions.some((s) => s.isRunning);
        }
      }

      res.json({ repos });
    } catch (err) {
      res.status(500).json({ error: "Failed to discover repos" });
    }
  });

  // Get Anthropic usage data
  router.get("/usage", async (_req, res) => {
    try {
      const usage = await getAnthropicUsage();
      res.json({ usage });
    } catch (err) {
      res.json({ usage: null });
    }
  });

  // Get per-model + cache-hit-ratio breakdown (TASK-B5 / P2-10).
  // Data source: local JSONL aggregation (Anthropic /usage only returns
  // utilization percentages, no per-model token counts).
  //
  // Query params:
  //   - `?sessionId=` — scope the aggregation to a single session. Avoids
  //     account-wide totals leaking into the per-session Usage tab (Bug E).
  //     Omitted → legacy global aggregate across every session in
  //     ~/.claude/projects/.
  //   - `?fromTs=&toTs=` (ISO-8601, [fromTs, toTs]) — Bug H. Only meaningful
  //     when paired with `?sessionId=`. Scopes the aggregation to a single
  //     turn's event window. The dashboard derives fromTs/toTs from the
  //     active TurnSnapshot's startTime/endTime. Timestamps (not indexes)
  //     are used so the server is frame-independent — dashboard/server event
  //     orderings can drift (live + REST merge) but timestamps are stable.
  //     The bounds are CLOSED on both ends: TurnSnapshot.endTime is the
  //     timestamp of the turn's last event (often the assistant's end_turn
  //     message that carries the bulk of the cost), so a strict `<` upper
  //     bound would drop it. A range supplied WITHOUT sessionId is ignored
  //     (back-compat: the legacy global aggregate runs unchanged).
  router.get("/usage/breakdown", (req, res) => {
    try {
      const sessionId =
        typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const fromTs =
        typeof req.query.fromTs === "string" ? req.query.fromTs : undefined;
      const toTs =
        typeof req.query.toTs === "string" ? req.query.toTs : undefined;

      // Turn-scoped path: sessionId + both range bounds present.
      if (sessionId && fromTs && toTs) {
        const matches = discoverSessions().filter((s) => s.id === sessionId);
        if (matches.length === 0) {
          // Unknown sessionId — explicit empty result, no leak to others.
          const breakdown = aggregateEventsPerModel([]);
          return res.json({ breakdown });
        }
        const { mainEvents, subagentEvents } = loadFullSession(matches[0]);
        // Merge main + subagent events the same way session-routes.ts does so
        // the timestamp window catches subagent assistant events too.
        const allSubEvents: SessionEvent[] = [];
        for (const evts of subagentEvents.values()) {
          allSubEvents.push(...evts);
        }
        const merged = [...mainEvents, ...allSubEvents].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        // [fromTs, toTs] — CLOSED interval. TurnSnapshot.endTime is the
        // timestamp of the LAST event in the turn (see turnSnapshot.ts:464,
        // turnSnapshot.ts:635), not "one past the end." A strict `<` upper
        // bound would drop the assistant's end_turn message, which usually
        // carries most of the turn's tokens/cost.
        const slice = merged.filter(
          (e) => e.timestamp >= fromTs && e.timestamp <= toTs,
        );
        const breakdown = aggregateEventsPerModel(slice);
        return res.json({ breakdown });
      }

      // Whole-session / global path (back-compat).
      let sessions = discoverSessions();
      if (sessionId) {
        sessions = sessions.filter((s) => s.id === sessionId);
      }
      const breakdown = aggregatePerModelUsage(sessions);
      res.json({ breakdown });
    } catch (err) {
      logger.error({ err }, "Failed to compute usage breakdown");
      res.status(500).json({ error: "Failed to compute usage breakdown" });
    }
  });

  // Get cost summary (24h, 7d)
  router.get("/costs", (_req, res) => {
    try {
      const sessions = discoverSessions();
      const costs = aggregateCosts(sessions);
      res.json({ costs });
    } catch (err) {
      res.status(500).json({ error: "Failed to compute costs" });
    }
  });

  // Get supported models for a session
  router.get("/sessions/:sessionId/models", async (req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.json({ models: FALLBACK_MODELS, source: "fallback" });
    }
    const session = sessionManager.getStatus(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.activeQuery?.supportedModels) {
      try {
        const models = await session.activeQuery.supportedModels();
        return res.json({ models, source: "sdk" });
      } catch {
        return res.json({ models: FALLBACK_MODELS, source: "fallback" });
      }
    }

    res.json({ models: FALLBACK_MODELS, source: "fallback" });
  });

  // Get supported slash commands for a session.
  //
  // Historical (JSONL-only) sessions are not tracked by SessionManager, so
  // `session` may be undefined. That is not an error — we simply skip the
  // active-session tiers and fall through to the global cache / static
  // fallback. Always returns 200 with a non-empty `commands` array and a
  // `source` field indicating which tier fired ("sdk" | "cached" |
  // "global-cache" | "fallback").
  router.get("/sessions/:sessionId/commands", async (req, res) => {
    const sessionManager = state?.sessionManager;
    const session = sessionManager?.getStatus(req.params.sessionId);

    // Tier 1: Live SDK query (active sessions only — includes marketplace/skill/plugin commands)
    if (session?.activeQuery?.supportedCommands) {
      try {
        const commands = await session.activeQuery.supportedCommands();
        const typed = commands as Array<{ name: string; description: string; argumentHint?: string }>;
        // Cache per-session and globally
        session.cachedCommands = typed;
        commandCache.update(typed);
        return res.json({ commands, source: "sdk" });
      } catch {
        // Fall through to next tier
      }
    }

    // Tier 2: Per-session cache (from previous activeQuery)
    if (session?.cachedCommands) {
      return res.json({ commands: session.cachedCommands, source: "cached" });
    }

    // Tier 3: Global cache (from any previous session's SDK query)
    const globalCached = commandCache.get();
    if (globalCached) {
      return res.json({ commands: globalCached, source: "global-cache" });
    }

    // Tier 4: Static fallback — always 200
    res.json({ commands: FALLBACK_COMMANDS, source: "fallback" });
  });

  // Get all known commands (no session required) — uses global cache or fallback
  router.get("/commands", (_req, res) => {
    const cached = commandCache.get();
    res.json({ commands: cached ?? FALLBACK_COMMANDS, source: cached ? "global-cache" : "fallback" });
  });

  // Get supported agents for a session
  router.get("/sessions/:sessionId/agents", async (req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.json({ agents: [], source: "fallback" });
    }
    const session = sessionManager.getStatus(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.activeQuery?.supportedAgents) {
      try {
        const agents = await session.activeQuery.supportedAgents();
        return res.json({ agents, source: "sdk" });
      } catch {
        return res.json({ agents: [], source: "fallback" });
      }
    }

    res.json({ agents: [], source: "fallback" });
  });

  // Setup validation -- checks prerequisites for first-launch gate
  router.get("/setup/validate", async (_req, res) => {
    const checks: { name: string; ok: boolean; detail: string }[] = [];

    // 1. Check Claude Code CLI in PATH
    {
      const result = spawnSync("which", ["claude"], { stdio: "pipe" });
      if (result.status === 0) {
        checks.push({ name: "cli", ok: true, detail: "Claude Code CLI found" });
      } else {
        checks.push({ name: "cli", ok: false, detail: "Claude Code CLI not found in PATH" });
      }
    }

    // 2. Check ~/.claude/projects/ directory exists
    const projectsDir = join(homedir(), ".claude", "projects");
    try {
      const stat = statSync(projectsDir);
      if (stat.isDirectory()) {
        checks.push({ name: "projects_dir", ok: true, detail: projectsDir });
      } else {
        checks.push({ name: "projects_dir", ok: false, detail: `${projectsDir} exists but is not a directory` });
      }
    } catch {
      checks.push({ name: "projects_dir", ok: false, detail: `${projectsDir} does not exist` });
    }

    // 3. Check if sessions are discoverable
    try {
      const sessions = discoverSessions();
      checks.push({ name: "sessions", ok: sessions.length > 0, detail: `${sessions.length} sessions found` });
    } catch {
      checks.push({ name: "sessions", ok: false, detail: "Failed to discover sessions" });
    }

    const allOk = checks.every((c) => c.ok);
    res.json({ valid: allOk, checks });
  });

  // === Diagnostics & Stats Routes ===

  // Health check diagnostics
  router.get("/doctor", (_req, res) => {
    const httpLog = logger.child({ subsystem: "http" });
    try {
      const checks: { name: string; status: "pass" | "warn" | "fail"; detail: string }[] = [];

      // 1. JSONL directory readable
      const projectsDir = join(homedir(), ".claude", "projects");
      try {
        if (existsSync(projectsDir) && statSync(projectsDir).isDirectory()) {
          checks.push({ name: "jsonl_directory", status: "pass", detail: projectsDir });
        } else {
          checks.push({ name: "jsonl_directory", status: "fail", detail: `${projectsDir} not found or not a directory` });
        }
      } catch {
        checks.push({ name: "jsonl_directory", status: "fail", detail: `Cannot access ${projectsDir}` });
      }

      // 2. Node version
      const nodeVersion = process.version;
      const major = parseInt(nodeVersion.slice(1), 10);
      checks.push({
        name: "node_version",
        status: major >= 18 ? "pass" : "warn",
        detail: nodeVersion,
      });

      // 3. Server uptime
      const uptimeSeconds = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSeconds / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const secs = uptimeSeconds % 60;
      checks.push({
        name: "server_uptime",
        status: "pass",
        detail: `${hours}h ${minutes}m ${secs}s`,
      });

      // 4. Session count
      try {
        const sessions = discoverSessions();
        checks.push({
          name: "session_count",
          status: sessions.length > 0 ? "pass" : "warn",
          detail: `${sessions.length} sessions discovered`,
        });
      } catch {
        checks.push({ name: "session_count", status: "fail", detail: "Failed to discover sessions" });
      }

      // 5. Active sessions
      const sessionManager = state?.sessionManager;
      const activeSessions = sessionManager ? sessionManager.getActiveSessions() : [];
      checks.push({
        name: "active_sessions",
        status: "pass",
        detail: `${activeSessions.length} active sessions`,
      });

      res.json({ checks });
    } catch (err) {
      httpLog.error({ error: String(err) }, "Doctor check failed");
      res.status(500).json({ error: "Failed to run diagnostics" });
    }
  });

  // Usage statistics aggregation
  router.get("/stats", (_req, res) => {
    const httpLog = logger.child({ subsystem: "http" });
    try {
      const sessions = discoverSessions();

      const totalSessions = sessions.length;
      const totalEvents = sessions.reduce((sum, s) => sum + s.eventCount, 0);

      // Sessions per day (last 7 days)
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const dayMap = new Map<string, number>();

      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, 0);
      }

      for (const session of sessions) {
        const sessionDate = new Date(session.startTime);
        if (sessionDate >= sevenDaysAgo) {
          const key = sessionDate.toISOString().slice(0, 10);
          dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
        }
      }

      const sessionsPerDay = Array.from(dayMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Top repos by session count (top 5)
      const repoMap = new Map<string, number>();
      for (const session of sessions) {
        if (session.cwd) {
          const repoName = session.cwd.split("/").pop() || session.cwd;
          repoMap.set(repoName, (repoMap.get(repoName) ?? 0) + 1);
        }
      }

      const topRepos = Array.from(repoMap.entries())
        .map(([name, sessionCount]) => ({ name, sessions: sessionCount }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 5);

      res.json({
        totalSessions,
        totalEvents,
        sessionsPerDay,
        topRepos,
      });
    } catch (err) {
      httpLog.error({ error: String(err) }, "Stats aggregation failed");
      res.status(500).json({ error: "Failed to compute stats" });
    }
  });

  return router;
}
