import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { join, resolve } from "node:path";
import { Router, json } from "express";
import { logger } from "../logger.js";
import {
  discoverSessions,
  discoverRepoGroups,
  loadFullSession,
} from "../parser/session-discovery.js";
import { computeMetrics } from "../analyzer/metrics.js";
import { getAnthropicUsage } from "../api/usage-client.js";
import { aggregateCosts } from "../analyzer/cost-aggregator.js";
import { getAgentEvents } from "../analyzer/agent-events.js";
import {
  addPermissionRequest,
  resolvePermissionRequest,
  getPendingPermissions,
  getPermissionStatus,
  addSessionAllowance,
  getSessionAllowances,
} from "../hooks/permission-handler.js";
import { buildLifecycleRecords } from "../debug/lifecycle-builder.js";
import { SessionManager } from "../session/session-manager.js";
import { MetricsCache } from "../cache/metrics-cache.js";
import type { SessionEvent } from "../types.js";
import type { ServerState } from "./server.js";
import { broadcast } from "./server.js";
import { mapSdkMessageToSSEEvents } from "./sse-event-handler.js";

/** Shared metrics cache — avoids re-parsing + re-computing metrics for unchanged files. */
const metricsCache = new MetricsCache({ maxEntries: 50, ttlMs: 60_000 });

export function setupRoutes(state?: ServerState): Router {
  const router = Router();
  router.use(json());

  // List all sessions
  router.get("/sessions", (_req, res) => {
    try {
      const sessions = discoverSessions();
      res.json({ sessions });
    } catch (err) {
      res.status(500).json({ error: "Failed to discover sessions" });
    }
  });

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

  // Get permissions info for a session (mode, allowances, pending count)
  // Must be defined BEFORE /sessions/:projectHash/:sessionId to avoid param collision
  router.get("/sessions/:sessionId/permissions-info", (req, res) => {
    try {
      const { sessionId } = req.params;

      // Check active session first (via SessionManager), then fall back to discovery
      const activeSession = state?.sessionManager?.getStatus(sessionId);
      let mode = "unknown";
      if (activeSession) {
        mode = activeSession.permissionMode;
      } else {
        // Try to find in discovered sessions
        const sessions = discoverSessions();
        const discovered = sessions.find((s) => s.id === sessionId);
        if (discovered) {
          mode = "default";
        }
      }

      const allowances = getSessionAllowances(sessionId);
      const pendingCount = getPendingPermissions().filter(
        (p) => p.sessionId === sessionId
      ).length;

      res.json({ mode, allowances, pendingCount });
    } catch (err) {
      res.status(500).json({ error: "Failed to get permissions info" });
    }
  });

  // === Discovery Endpoints (P1-06) ===
  // Must be defined BEFORE /sessions/:projectHash/:sessionId to avoid param collision

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

  // Get session detail + metrics
  router.get("/sessions/:projectHash/:sessionId", (req, res) => {
    try {
      const { projectHash, sessionId } = req.params;
      const sessions = discoverSessions();
      const session = sessions.find(
        (s) => s.projectHash === projectHash && s.id === sessionId
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Try metrics cache (keyed by filePath + size + mtime)
      let metrics!: ReturnType<typeof computeMetrics>;
      let allEvents!: SessionEvent[];
      let subagentMeta!: Map<string, { agentType: string; description: string }>;
      let cacheHit = false;

      try {
        const stat = statSync(session.path);
        const cacheKey = { filePath: session.path, size: stat.size, mtimeMs: stat.mtimeMs };
        const cached = metricsCache.get(cacheKey);

        if (cached) {
          metrics = cached.metrics;
          allEvents = cached.events;
          subagentMeta = cached.subagentMeta;
          cacheHit = true;
        }
      } catch {
        // stat failed — proceed without cache
      }

      if (!cacheHit) {
        const { mainEvents, subagentEvents, subagentMeta: loadedMeta } =
          loadFullSession(session);
        subagentMeta = loadedMeta;
        metrics = computeMetrics(
          session,
          mainEvents,
          subagentEvents,
          subagentMeta
        );

        // Merge main + subagent events, sorted by timestamp
        const allSubEvents: SessionEvent[] = [];
        for (const evts of subagentEvents.values()) {
          allSubEvents.push(...evts);
        }
        allEvents = [...mainEvents, ...allSubEvents].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Store in cache if stat is available
        try {
          const stat = statSync(session.path);
          metricsCache.set(
            { filePath: session.path, size: stat.size, mtimeMs: stat.mtimeMs },
            { metrics, events: allEvents, subagentMeta }
          );
        } catch {
          // File not statable — skip caching
        }
      }

      // Convert subagentMeta Map to plain object for JSON serialization
      const subagentMetaObj: Record<
        string,
        { agentType: string; description: string }
      > = {};
      for (const [id, meta] of subagentMeta.entries()) {
        subagentMetaObj[id] = meta;
      }

      // Store lifecycle data in debug DB (dev mode only)
      if (state?.debugDb) {
        try {
          const sortedEvents = [...allEvents].sort((a, b) =>
            (a.timestamp ?? "").localeCompare(b.timestamp ?? "")
          );

          const records = buildLifecycleRecords(
            session.id,
            sortedEvents,
            subagentMeta
          );

          state.debugDb.upsertSession({
            sessionId: session.id,
            projectHash: session.projectHash,
            cwd: session.cwd,
            model: session.model,
            startTime: session.startTime,
            lastUpdated: new Date().toISOString(),
          });

          for (const turn of records.turns) {
            state.debugDb.upsertTurn(turn);
          }

          for (const lifecycle of records.agentLifecycles) {
            state.debugDb.upsertAgentLifecycle({
              ...lifecycle,
              parentAgentId: lifecycle.parentAgentId ?? undefined,
              completedAt: lifecycle.completedAt ?? undefined,
              description: lifecycle.description ?? undefined,
            });
          }

          state.debugDb.insertEventBatch(
            records.lifecycleEvents.map((e) => ({
              ...e,
              toolName: e.toolName ?? undefined,
            }))
          );
        } catch (err) {
          logger.warn({ error: String(err) }, "debug-db: failed to store lifecycle data");
        }
      }

      res.json({ metrics, events: allEvents, subagentMeta: subagentMetaObj });
    } catch (err) {
      res.status(500).json({ error: "Failed to load session" });
    }
  });

  // List files in session cwd (for @ autocomplete)
  const IGNORED_DIRS = new Set([
    "node_modules", ".git", ".hg", ".svn", "__pycache__",
    ".next", ".nuxt", "dist", ".cache", ".turbo",
  ]);

  router.get("/sessions/:projectHash/:sessionId/files", (req, res) => {
    try {
      const { projectHash, sessionId } = req.params;
      const prefix = (req.query.prefix as string) ?? "";

      const sessions = discoverSessions();
      const session = sessions.find(
        (s) => s.projectHash === projectHash && s.id === sessionId
      );
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const cwd = session.cwd;
      if (!cwd || !existsSync(cwd)) {
        return res.json({ files: [] });
      }

      // Split prefix into directory part and name filter
      // e.g. "src/comp" -> dir="src", filter="comp"
      // e.g. "src/" -> dir="src", filter=""
      // e.g. "pack" -> dir="", filter="pack"
      const lastSlash = prefix.lastIndexOf("/");
      const dirPart = lastSlash >= 0 ? prefix.slice(0, lastSlash) : "";
      const filterPart = lastSlash >= 0 ? prefix.slice(lastSlash + 1) : prefix;

      const targetDir = dirPart ? resolve(cwd, dirPart) : cwd;

      // Security: ensure targetDir is within cwd (prevent traversal)
      // Must append path.sep to prevent sibling directory prefix bypass
      // e.g. "/home/user/project-secrets".startsWith("/home/user/project") is true
      const resolvedCwd = resolve(cwd);
      const resolvedTarget = resolve(targetDir);
      if (
        resolvedTarget !== resolvedCwd &&
        !resolvedTarget.startsWith(resolvedCwd + path.sep)
      ) {
        return res.json({ files: [] });
      }

      if (!existsSync(targetDir)) {
        return res.json({ files: [] });
      }

      const entries = readdirSync(targetDir, { withFileTypes: true });
      const filterLower = filterPart.toLowerCase();

      const files: string[] = [];
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (filterLower && !entry.name.toLowerCase().startsWith(filterLower)) continue;

        const relativePath = dirPart
          ? `${dirPart}/${entry.name}`
          : entry.name;

        if (entry.isDirectory()) {
          files.push(relativePath + "/");
        } else {
          files.push(relativePath);
        }

        if (files.length >= 20) break;
      }

      res.json({ files });
    } catch (err) {
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  // Get git diff for a session's cwd
  router.get("/sessions/:projectHash/:sessionId/git-diff", (req, res) => {
    try {
      const { projectHash, sessionId } = req.params;
      const sessions = discoverSessions();
      const session = sessions.find(
        (s) => s.projectHash === projectHash && s.id === sessionId
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const cwd = session.cwd;
      if (!cwd) {
        return res.json({ stat: "", diff: "" });
      }

      const statResult = spawnSync("git", ["diff", "--stat", "--no-color"], {
        cwd,
        timeout: 5000,
      });
      const fullResult = spawnSync("git", ["diff", "--no-color"], {
        cwd,
        timeout: 10000,
      });

      const stat = (!statResult.error && statResult.status === 0)
        ? (typeof statResult.stdout === "string" ? statResult.stdout : statResult.stdout?.toString() ?? "")
        : "";
      const diff = (!fullResult.error && fullResult.status === 0)
        ? (typeof fullResult.stdout === "string" ? fullResult.stdout : fullResult.stdout?.toString() ?? "")
        : "";

      res.json({ stat, diff });
    } catch (err) {
      res.json({ stat: "", diff: "" });
    }
  });

  // Get agent events/logs
  router.get(
    "/sessions/:projectHash/:sessionId/events/:agentId",
    (req, res) => {
      try {
        const { projectHash, sessionId, agentId } = req.params;
        const sessions = discoverSessions();
        const session = sessions.find(
          (s) => s.projectHash === projectHash && s.id === sessionId
        );

        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        const events = getAgentEvents(session, agentId);
        res.json({ events });
      } catch (err) {
        res.status(500).json({ error: "Failed to load agent events" });
      }
    }
  );

  // Permission request from hook script
  router.post("/permissions/request", (req, res) => {
    try {
      const { toolName, input, sessionId, agentId } = req.body;
      const permission = addPermissionRequest({
        sessionId: sessionId || "",
        agentId: agentId || "main",
        toolName: toolName || "unknown",
        input: input || {},
      });

      // Broadcast via WebSocket
      if (state) {
        broadcast(state, { type: "permission-request", permission });
      }

      res.json({ id: permission.id, status: "pending" });
    } catch (err) {
      res.status(500).json({ error: "Failed to register permission" });
    }
  });

  // Get permission status (for hook polling)
  router.get("/permissions/:id/status", (req, res) => {
    const status = getPermissionStatus(req.params.id);
    if (!status) {
      return res.status(404).json({ error: "Permission not found" });
    }
    res.json(status);
  });

  // Approve/deny permission
  router.post("/permissions/:id/decide", (req, res) => {
    try {
      const { decision, scope } = req.body; // decision: "approved" | "denied", scope?: "session"
      const result = resolvePermissionRequest(req.params.id, decision);

      // If scope is "session", add tool to session allowances for auto-approval
      if (scope === "session" && decision === "approved" && result) {
        addSessionAllowance(result.sessionId, result.toolName);
      }

      // Also resolve via SessionManager (for promise-based sessions)
      const sessionResolved = state?.sessionManager
        ? state.sessionManager.resolvePermission(req.params.id, decision)
        : false;

      if (!result && !sessionResolved) {
        return res.status(404).json({ error: "Permission not found" });
      }

      // Broadcast resolution
      if (state) {
        broadcast(state, {
          type: "permission-resolved",
          id: req.params.id,
          decision,
        });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve permission" });
    }
  });

  // List pending permissions
  router.get("/permissions/pending", (_req, res) => {
    res.json({ permissions: getPendingPermissions() });
  });

  // List pending questions (survives page refresh — prevents deadlock)
  router.get("/questions/pending", (_req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.json({ questions: [] });
    }
    res.json({ questions: sessionManager.getPendingQuestions() });
  });

  // Answer a question from the agent (AskUserQuestion)
  router.post("/questions/:questionId/answer", (req, res) => {
    try {
      const { answer } = req.body;
      if (!answer || typeof answer !== "string") {
        return res.status(400).json({ error: "answer is required" });
      }
      const sessionManager = state?.sessionManager;
      if (!sessionManager) {
        return res.status(500).json({ error: "Session manager not available" });
      }
      const resolved = sessionManager.resolveQuestion(req.params.questionId, answer);
      if (!resolved) {
        return res.status(404).json({ error: "Question not found" });
      }
      // Broadcast answer to dashboard
      if (state) {
        broadcast(state, {
          type: "question-answered",
          id: req.params.questionId,
          answer,
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to answer question" });
    }
  });

  // === Session Lifecycle Routes ===

  // Start a new session
  router.post("/sessions/new", async (req, res) => {
    try {
      const { cwd } = req.body;
      if (!cwd || typeof cwd !== "string") {
        return res.status(400).json({ error: "cwd is required" });
      }
      const sessionManager = state?.sessionManager;
      if (!sessionManager) {
        return res.status(500).json({ error: "Session manager not available" });
      }
      const sessionId = await sessionManager.startSession(cwd);
      res.json({ sessionId });
    } catch (err) {
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Send message to session (SSE stream)
  router.post("/sessions/:sessionId/message", async (req, res) => {
    const { sessionId } = req.params;
    const { prompt, images } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }

    const session = sessionManager.getStatus(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.on("close", () => {
      sessionManager.abortSession(sessionId);
    });

    try {
      // Parse images from body: extract base64 data and mediaType
      const parsedImages = Array.isArray(images)
        ? images.map((img: { dataUrl?: string; data?: string; mediaType?: string; name?: string }) => {
            // Client sends dataUrl (data:image/png;base64,...), extract base64 and mediaType
            let data = img.data || "";
            let mediaType = img.mediaType || "image/png";
            if (img.dataUrl) {
              const match = img.dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
              if (match) {
                mediaType = match[1];
                data = match[2];
              }
            }
            return { mediaType, data };
          })
        : undefined;

      for await (const message of sessionManager.sendMessage(sessionId, prompt, parsedImages)) {
        const sseEvents = mapSdkMessageToSSEEvents(
          message as { type: string; [key: string]: unknown }
        );
        for (const sseEvent of sseEvents) {
          res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
        }
      }

      res.write(
        `data: ${JSON.stringify({ type: "done", exitCode: 0 })}\n\n`
      );
      res.end();
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) })}\n\n`
      );
      res.end();
    }
  });

  // Set model for an active session
  router.post("/sessions/:sessionId/model", (req, res) => {
    const { model } = req.body;
    if (!model || typeof model !== "string") {
      return res.status(400).json({ error: "model is required (string)" });
    }
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const success = sessionManager.setModel(req.params.sessionId, model);
    if (!success) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ success: true, model });
  });

  // Set permission mode for an active session
  router.post("/sessions/:sessionId/permission-mode", (req, res) => {
    const { mode } = req.body;
    if (!mode || typeof mode !== "string") {
      return res.status(400).json({ error: "mode is required" });
    }

    if (!SessionManager.isValidPermissionMode(mode)) {
      return res.status(400).json({ error: `Invalid mode: ${mode}. Must be one of: default, acceptEdits, bypassPermissions, plan, dontAsk` });
    }

    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const success = sessionManager.setPermissionMode(req.params.sessionId, mode);
    if (!success) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ success: true, mode });
  });

  // Set fast mode for an active session
  router.post("/sessions/:sessionId/fast", (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled is required (boolean)" });
    }
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const success = sessionManager.setFastMode(req.params.sessionId, enabled);
    if (!success) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ success: true, fastMode: enabled });
  });

  // Set effort level for an active session
  router.post("/sessions/:sessionId/effort", (req, res) => {
    const { level } = req.body;
    const validLevels = new Set(["low", "medium", "high"]);
    if (!level || typeof level !== "string" || !validLevels.has(level)) {
      return res.status(400).json({ error: "level is required (low | medium | high)" });
    }
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const success = sessionManager.setEffortLevel(req.params.sessionId, level as "low" | "medium" | "high");
    if (!success) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ success: true, effortLevel: level });
  });

  // Rewind files to a previous user message state
  router.post("/sessions/:sessionId/rewind", async (req, res) => {
    const { userMessageId, dryRun } = req.body;
    if (!userMessageId || typeof userMessageId !== "string") {
      return res.status(400).json({ error: "userMessageId is required (string)" });
    }
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const session = sessionManager.getStatus(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    try {
      const result = await sessionManager.rewindFiles(
        req.params.sessionId,
        userMessageId,
        dryRun === true
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Rewind failed", detail: String(err) });
    }
  });

  // Abort active session streaming
  router.post("/sessions/:sessionId/abort", (req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const aborted = sessionManager.abortSession(req.params.sessionId);
    if (!aborted) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ ok: true });
  });


  // Resume a historical session (register it with SessionManager)
  router.post("/sessions/:sessionId/resume", async (req, res) => {
    const { cwd } = req.body;
    if (!cwd || typeof cwd !== "string") {
      return res.status(400).json({ error: "cwd is required" });
    }
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    try {
      await sessionManager.resumeSession(req.params.sessionId, cwd);
      res.json({ ok: true, sessionId: req.params.sessionId });
    } catch (err) {
      res.status(500).json({ error: "Failed to resume session" });
    }
  });

  // Delete/close an active session
  router.delete("/sessions/:sessionId", (req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const removed = sessionManager.removeSession(req.params.sessionId);
    if (!removed) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ ok: true });
  });

  // List active sessions
  router.get("/sessions/active", (_req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.json({ sessions: [] });
    }
    const sessions = sessionManager.getActiveSessions().map((s) => ({
      sessionId: s.sessionId,
      cwd: s.cwd,
      status: s.status,
      createdAt: s.createdAt,
    }));
    res.json({ sessions });
  });

  // Setup validation — checks prerequisites for first-launch gate
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

  // Fork session — stub (SDK does not yet support forkSession)
  router.post("/sessions/:sessionId/fork", (_req, res) => {
    res.status(501).json({
      error: "Not implemented",
      detail: "Session forking requires SDK support (forkSession API) which is not yet available",
    });
  });

  // Open file in editor (cross-panel interaction)
  router.post("/open-file", (req, res) => {
    try {
      const { filePath, line } = req.body as { filePath?: string; line?: number };
      if (!filePath || typeof filePath !== "string") {
        res.status(400).json({ error: "filePath is required" });
        return;
      }

      // Security: basic path validation - must be absolute and no traversal
      if (!filePath.startsWith("/") || filePath.includes("..")) {
        res.status(400).json({ error: "Invalid file path" });
        return;
      }

      // Security: reject shell metacharacters in file path (defense-in-depth)
      // Allow only [a-zA-Z0-9_\-.\/] — no quotes, semicolons, backticks, etc.
      if (/[^a-zA-Z0-9_\-./]/.test(filePath)) {
        res.status(400).json({ error: "Invalid file path" });
        return;
      }

      // Try VS Code first, then fall back to $EDITOR
      // Uses spawnSync to avoid shell interpretation (no command injection)
      const gotoArg = line ? `${filePath}:${line}` : filePath;
      const vscodeResult = spawnSync("code", ["--goto", gotoArg], { timeout: 5000 });
      if (!vscodeResult.error && vscodeResult.status === 0) {
        res.json({ success: true, editor: "vscode" });
        return;
      }

      const editor = process.env.EDITOR || "vim";
      // Defense-in-depth: reject EDITOR with shell metacharacters
      // (spawnSync makes this redundant, but kept as a safety layer)
      if (/[;&|`$(){}!#]/.test(editor)) {
        res.status(500).json({ error: "EDITOR env var contains invalid shell metacharacters" });
        return;
      }

      const editorResult = spawnSync(editor, [filePath], { timeout: 5000 });
      if (!editorResult.error && editorResult.status === 0) {
        res.json({ success: true, editor });
      } else {
        res.status(500).json({ error: "No editor available" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to open file" });
    }
  });

  // Execute bash command in session cwd (P1-07: ! bash mode)
  router.post("/sessions/:sessionId/bash", (req, res) => {
    try {
      const { command } = req.body;
      if (!command || typeof command !== "string") {
        return res.status(400).json({ error: "command is required (string)" });
      }

      const sessionManager = state?.sessionManager;
      if (!sessionManager) {
        return res.status(500).json({ error: "Session manager not available" });
      }

      const session = sessionManager.getStatus(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const result = spawnSync("bash", ["-c", command], {
        cwd: session.cwd,
        timeout: 30000,
      });

      const stdout = result.stdout
        ? (typeof result.stdout === "string" ? result.stdout : result.stdout.toString())
        : "";
      const stderr = result.stderr
        ? (typeof result.stderr === "string" ? result.stderr : result.stderr.toString())
        : "";

      res.json({
        stdout,
        stderr,
        exitCode: result.status ?? 1,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to execute command" });
    }
  });

  // === Debug Lifecycle Routes (dev-only) ===

  router.get("/debug/sessions", (_req, res) => {
    if (!state?.debugDb) {
      return res.status(404).json({ error: "Debug DB not available (dev mode only)" });
    }
    try {
      const sessions = state.debugDb.getSessions();
      const result = sessions.map((s) => ({
        ...s,
        turnCount: state!.debugDb!.getTurns(s.sessionId).length,
        agentCount: state!.debugDb!.getAgentLifecycles(s.sessionId).length,
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to query debug sessions" });
    }
  });

  router.get("/debug/sessions/:sessionId/turns", (req, res) => {
    if (!state?.debugDb) {
      return res.status(404).json({ error: "Debug DB not available (dev mode only)" });
    }
    try {
      const turns = state.debugDb.getTurns(req.params.sessionId);
      const result = turns.map((t) => ({
        ...t,
        agentCount: state!.debugDb!.getAgentLifecycles(req.params.sessionId, t.turnNumber).length,
        eventCount: state!.debugDb!.getLifecycleEvents(req.params.sessionId, t.turnNumber).length,
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to query debug turns" });
    }
  });

  router.get("/debug/sessions/:sessionId/turns/:turnNumber/agents", (req, res) => {
    if (!state?.debugDb) {
      return res.status(404).json({ error: "Debug DB not available (dev mode only)" });
    }
    try {
      const agents = state.debugDb.getAgentLifecycles(
        req.params.sessionId,
        parseInt(req.params.turnNumber)
      );
      res.json(agents);
    } catch (err) {
      res.status(500).json({ error: "Failed to query debug agents" });
    }
  });

  router.get("/debug/sessions/:sessionId/turns/:turnNumber/events", (req, res) => {
    if (!state?.debugDb) {
      return res.status(404).json({ error: "Debug DB not available (dev mode only)" });
    }
    try {
      const agentId = req.query.agentId as string | undefined;
      const events = state.debugDb.getLifecycleEvents(
        req.params.sessionId,
        parseInt(req.params.turnNumber),
        agentId
      );
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: "Failed to query debug events" });
    }
  });

  router.get("/debug/sessions/:sessionId/turns/:turnNumber/graph", (req, res) => {
    if (!state?.debugDb) {
      return res.status(404).json({ error: "Debug DB not available (dev mode only)" });
    }
    try {
      const upToEvent = parseInt(req.query.upToEvent as string) || 999999;
      const graph = state.debugDb.getGraphAtEvent(
        req.params.sessionId,
        parseInt(req.params.turnNumber),
        upToEvent
      );
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: "Failed to query debug graph" });
    }
  });

  // === Settings & Config Routes (GROUP-4) ===

  // Get hooks from ~/.claude/settings.json (read-only)
  router.get("/settings/hooks", (_req, res) => {
    try {
      const settingsPath = join(homedir(), ".claude", "settings.json");
      if (!existsSync(settingsPath)) {
        return res.json({ hooks: {} });
      }
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      res.json({ hooks: settings.hooks ?? {} });
    } catch {
      res.json({ hooks: {} });
    }
  });

  // Get CLAUDE.md content from session cwd (read-only)
  router.get("/sessions/:projectHash/:sessionId/memory", (req, res) => {
    try {
      const { projectHash, sessionId } = req.params;
      const sessions = discoverSessions();
      const session = sessions.find(
        (s) => s.projectHash === projectHash && s.id === sessionId
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const cwd = session.cwd;
      if (!cwd) {
        return res.json({ content: null });
      }

      const claudeMdPath = join(cwd, "CLAUDE.md");
      if (!existsSync(claudeMdPath)) {
        return res.json({ content: null });
      }

      const content = readFileSync(claudeMdPath, "utf-8");
      res.json({ content });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to read CLAUDE.md");
      res.json({ content: null });
    }
  });

  // Initialize CLAUDE.md in session cwd
  router.post("/sessions/:sessionId/init", (req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }

    const session = sessionManager.getStatus(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const claudeMdPath = join(session.cwd, "CLAUDE.md");
    if (existsSync(claudeMdPath)) {
      return res.json({ created: false, message: "CLAUDE.md already exists" });
    }

    const scaffoldTemplate = `# Project Name

## Build & Test
<!-- Add your build/test commands here -->

## Code Style
<!-- Describe your code style preferences -->

## Key Architecture
<!-- Describe key architectural decisions -->
`;

    try {
      writeFileSync(claudeMdPath, scaffoldTemplate, "utf-8");
      res.json({ created: true, message: "CLAUDE.md created" });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to create CLAUDE.md");
      res.status(500).json({ error: "Failed to create CLAUDE.md" });
    }
  });

  // === Diagnostics & Stats Routes (GROUP-5) ===

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

  // MCP server list from settings
  router.get("/mcp/servers", (_req, res) => {
    try {
      const settingsPath = join(homedir(), ".claude", "settings.json");
      if (!existsSync(settingsPath)) {
        return res.json({ servers: [] });
      }

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      const mcpServers = settings.mcpServers ?? {};

      const servers = Object.entries(mcpServers).map(([name, config]) => {
        const cfg = config as Record<string, unknown>;
        return {
          name,
          command: cfg.command ?? null,
          args: Array.isArray(cfg.args) ? cfg.args : [],
          status: "configured" as const,
          toolCount: 0, // Cannot determine without connecting
        };
      });

      res.json({ servers });
    } catch {
      res.json({ servers: [] });
    }
  });

  // === Live MCP via SDK (GROUP-D / P1-05) ===

  /** Helper: read MCP servers from settings.json (static fallback) */
  function readMcpFromSettings(): Array<{ name: string; command: string | null; args: string[]; status: string; toolCount: number }> {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    if (!existsSync(settingsPath)) return [];
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const mcpServers = settings.mcpServers ?? {};
    return Object.entries(mcpServers).map(([name, config]) => {
      const cfg = config as Record<string, unknown>;
      return {
        name,
        command: (cfg.command as string) ?? null,
        args: Array.isArray(cfg.args) ? (cfg.args as string[]) : [],
        status: "configured",
        toolCount: 0,
      };
    });
  }

  // Get MCP server status for a session (uses SDK if available, else settings.json)
  router.get("/sessions/:sessionId/mcp/status", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = state?.sessionManager?.getStatus(sessionId);

      // If there's an active query with mcpServerStatus, use it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeQuery = (session as any)?.activeQuery;
      if (activeQuery && typeof activeQuery.mcpServerStatus === "function") {
        try {
          const status = await activeQuery.mcpServerStatus();
          return res.json({ servers: status, source: "sdk" });
        } catch {
          // Fall through to settings.json
        }
      }

      // Fallback: read from settings.json
      const servers = readMcpFromSettings();
      res.json({ servers, source: "settings" });
    } catch {
      res.json({ servers: [], source: "error" });
    }
  });

  // Toggle MCP server enabled/disabled (requires active query)
  router.post("/sessions/:sessionId/mcp/toggle", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { serverName, enabled } = req.body;

      if (!serverName || typeof serverName !== "string") {
        return res.status(400).json({ error: "serverName is required (string)" });
      }
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled is required (boolean)" });
      }

      const session = state?.sessionManager?.getStatus(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeQuery = (session as any)?.activeQuery;
      if (!activeQuery || typeof activeQuery.toggleMcpServer !== "function") {
        return res.status(400).json({ error: "No active query. Toggle requires an active streaming session." });
      }

      await activeQuery.toggleMcpServer(serverName, enabled);
      res.json({ success: true, serverName, enabled });
    } catch (err) {
      res.status(500).json({ error: "Failed to toggle MCP server" });
    }
  });

  // Reconnect MCP server (requires active query)
  router.post("/sessions/:sessionId/mcp/reconnect", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { serverName } = req.body;

      if (!serverName || typeof serverName !== "string") {
        return res.status(400).json({ error: "serverName is required (string)" });
      }

      const session = state?.sessionManager?.getStatus(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeQuery = (session as any)?.activeQuery;
      if (!activeQuery || typeof activeQuery.reconnectMcpServer !== "function") {
        return res.status(400).json({ error: "No active query. Reconnect requires an active streaming session." });
      }

      await activeQuery.reconnectMcpServer(serverName);
      res.json({ success: true, serverName });
    } catch (err) {
      res.status(500).json({ error: "Failed to reconnect MCP server" });
    }
  });

  return router;
}
