import { execSync } from "child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Router } from "express";
import {
  discoverSessions,
  discoverRepoGroups,
} from "../../parser/session-discovery.js";
import { getAnthropicUsage } from "../../api/usage-client.js";
import { aggregateCosts } from "../../analyzer/cost-aggregator.js";
import { logger } from "../../logger.js";
import type { RouteContext } from "./route-context.js";

// Fallback model list when SDK Query is not available
const FALLBACK_MODELS = [
  { value: "claude-opus-4-6", displayName: "Claude Opus 4", description: "Most capable model" },
  { value: "claude-sonnet-4-6", displayName: "Claude Sonnet 4", description: "Balanced performance" },
  { value: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", description: "Fastest model" },
];

// Fallback slash commands when SDK Query is not available
const FALLBACK_COMMANDS = [
  { name: "help", description: "Show available commands", argumentHint: "" },
  { name: "clear", description: "Clear context (starts new session)", argumentHint: "" },
  { name: "compact", description: "Compact the conversation context", argumentHint: "" },
  { name: "context", description: "Show context window usage", argumentHint: "" },
  { name: "cost", description: "Show session cost summary", argumentHint: "" },
  { name: "diff", description: "Show git diff (uncommitted changes)", argumentHint: "" },
  { name: "effort", description: "Set effort level", argumentHint: "<low|medium|high>" },
  { name: "fast", description: "Toggle fast mode", argumentHint: "<on|off>" },
  { name: "hooks", description: "View configured hooks", argumentHint: "" },
  { name: "init", description: "Initialize CLAUDE.md in project", argumentHint: "" },
  { name: "mcp", description: "Show connected MCP servers and tools", argumentHint: "" },
  { name: "memory", description: "View CLAUDE.md content", argumentHint: "" },
  { name: "model", description: "Show or switch model", argumentHint: "<model>" },
  { name: "permissions", description: "Show permission mode and allowances", argumentHint: "" },
  { name: "plan", description: "Switch to plan mode (read-only)", argumentHint: "" },
  { name: "rewind", description: "Rewind conversation", argumentHint: "[N turns]" },
];

export function createDiscoveryRoutes({ state }: RouteContext): Router {
  const router = Router();

  // List repos grouped by cwd
  router.get("/repos", (_req, res) => {
    try {
      const repos = discoverRepoGroups();
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

  // Get supported slash commands for a session
  router.get("/sessions/:sessionId/commands", async (req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.json({ commands: FALLBACK_COMMANDS, source: "fallback" });
    }
    const session = sessionManager.getStatus(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.activeQuery?.supportedCommands) {
      try {
        const commands = await session.activeQuery.supportedCommands();
        return res.json({ commands, source: "sdk" });
      } catch {
        return res.json({ commands: FALLBACK_COMMANDS, source: "fallback" });
      }
    }

    res.json({ commands: FALLBACK_COMMANDS, source: "fallback" });
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
    try {
      execSync("which claude", { stdio: "pipe" });
      checks.push({ name: "cli", ok: true, detail: "Claude Code CLI found" });
    } catch {
      checks.push({ name: "cli", ok: false, detail: "Claude Code CLI not found in PATH" });
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
