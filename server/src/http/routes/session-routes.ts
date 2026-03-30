import { spawnSync } from "child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile, access } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Router } from "express";
import { logger } from "../../logger.js";
import {
  discoverSessions,
  loadFullSession,
} from "../../parser/session-discovery.js";
import { computeMetrics } from "../../analyzer/metrics.js";
import { getAgentEvents } from "../../analyzer/agent-events.js";
import {
  addPermissionRequest,
  resolvePermissionRequest,
  getPendingPermissions,
  getPermissionStatus,
  addSessionAllowance,
  getSessionAllowances,
} from "../../hooks/permission-handler.js";
import { buildLifecycleRecords } from "../../debug/lifecycle-builder.js";
import { SessionManager } from "../../session/session-manager.js";
import type { SessionEvent } from "../../types.js";
import { broadcast } from "../server.js";
import { mapSdkMessageToSSEEvents } from "../sse-event-handler.js";
import { metricsCache } from "./route-context.js";
import type { RouteContext } from "./route-context.js";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "__pycache__",
  ".next", ".nuxt", "dist", ".cache", ".turbo",
]);

export function createSessionRoutes({ state }: RouteContext): Router {
  const router = Router();

  // List all sessions
  router.get("/sessions", (_req, res) => {
    try {
      const sessions = discoverSessions();
      res.json({ sessions });
    } catch (err) {
      res.status(500).json({ error: "Failed to discover sessions" });
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
        // stat failed -- proceed without cache
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
          // File not statable -- skip caching
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
      const lastSlash = prefix.lastIndexOf("/");
      const dirPart = lastSlash >= 0 ? prefix.slice(0, lastSlash) : "";
      const filterPart = lastSlash >= 0 ? prefix.slice(lastSlash + 1) : prefix;

      const targetDir = dirPart ? resolve(cwd, dirPart) : cwd;

      // Security: ensure targetDir is within cwd (prevent traversal)
      const resolvedCwd = resolve(cwd);
      const resolvedTarget = resolve(targetDir);
      if (
        resolvedTarget !== resolvedCwd &&
        !resolvedTarget.startsWith(resolvedCwd + sep)
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
      const { decision, scope } = req.body;
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

  // List pending questions (survives page refresh -- prevents deadlock)
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

  // Rename a session via SDK renameSession()
  router.post("/sessions/:sessionId/rename", async (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== "string" || title.trim() === "") {
        return res.status(400).json({ error: "title must be a non-empty string" });
      }

      const { renameSession } = await import("@anthropic-ai/claude-agent-sdk");
      await renameSession(req.params.sessionId, title.trim());
      res.json({ success: true, title: title.trim() });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to rename session");
      res.status(500).json({ error: "Failed to rename session" });
    }
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

  // Fork session -- stub (SDK does not yet support forkSession)
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
      if (/[^a-zA-Z0-9_\-./]/.test(filePath)) {
        res.status(400).json({ error: "Invalid file path" });
        return;
      }

      // Try VS Code first, then fall back to $EDITOR
      const gotoArg = line ? `${filePath}:${line}` : filePath;
      const vscodeResult = spawnSync("code", ["--goto", gotoArg], { timeout: 5000 });
      if (!vscodeResult.error && vscodeResult.status === 0) {
        res.json({ success: true, editor: "vscode" });
        return;
      }

      const editor = process.env.EDITOR || "vim";
      // Defense-in-depth: reject EDITOR with shell metacharacters
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

  // Get CLAUDE.md content from session cwd (read-only)
  router.get("/sessions/:projectHash/:sessionId/memory", async (req, res) => {
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
      try {
        await access(claudeMdPath);
      } catch {
        return res.json({ content: null });
      }

      const content = await readFile(claudeMdPath, "utf-8");
      res.json({ content });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to read CLAUDE.md");
      res.json({ content: null });
    }
  });

  // Update CLAUDE.md content in session cwd
  router.put("/sessions/:projectHash/:sessionId/memory", async (req, res) => {
    try {
      const { projectHash, sessionId } = req.params;
      const { content } = req.body;

      if (content === undefined || content === null || typeof content !== "string") {
        return res.status(400).json({ error: "content must be a string" });
      }

      const sessions = discoverSessions();
      const session = sessions.find(
        (s) => s.projectHash === projectHash && s.id === sessionId
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const cwd = session.cwd;
      if (!cwd) {
        return res.status(400).json({ error: "Session has no working directory" });
      }

      // Security: only write CLAUDE.md in the session's cwd, never arbitrary paths
      const claudeMdPath = join(cwd, "CLAUDE.md");
      await writeFile(claudeMdPath, content, "utf-8");
      res.json({ success: true });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to write CLAUDE.md");
      res.status(500).json({ error: "Failed to write CLAUDE.md" });
    }
  });

  // Initialize CLAUDE.md in session cwd
  router.post("/sessions/:sessionId/init", async (req, res) => {
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }

    const session = sessionManager.getStatus(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const claudeMdPath = join(session.cwd, "CLAUDE.md");
    try {
      await access(claudeMdPath);
      return res.json({ created: false, message: "CLAUDE.md already exists" });
    } catch {
      // File doesn't exist, proceed to create
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
      await writeFile(claudeMdPath, scaffoldTemplate, "utf-8");
      res.json({ created: true, message: "CLAUDE.md created" });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to create CLAUDE.md");
      res.status(500).json({ error: "Failed to create CLAUDE.md" });
    }
  });

  return router;
}
