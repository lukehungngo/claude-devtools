import { spawn, spawnSync } from "child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile, access } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Router } from "express";
import { logger } from "../../logger.js";
import {
  discoverSessions,
  loadFullSession,
} from "../../parser/session-discovery.js";
import { loadDaemonTasks } from "../../parser/daemon-task-discovery.js";
import { collectorBuffer } from "../../collector/buffer.js";
import { computeMetrics } from "../../analyzer/metrics.js";
import { isSyntheticAgentId } from "../../lib/agentIds.js";
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
import type { EffortLevel } from "../../session/session-manager.js";
import type { SessionEvent } from "../../types.js";
import { broadcast } from "../server.js";
import { buildNewEventsMessage } from "../watcher.js";
import { mapSdkMessageToSSEEvents } from "../sse-event-handler.js";
import { metricsCache } from "./route-context.js";
import type { RouteContext } from "./route-context.js";
import { updateModelContextWindows } from "../../cache/model-context-cache.js";
import { RUNNING_THRESHOLD_MS } from "../../cache/session-cache.js";

function spawnAsync(
  cmd: string,
  args: string[],
  options: { cwd: string; timeout: number }
): Promise<{ stdout: string; stderr: string; status: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: options.cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, status: 124 });
    }, options.timeout);
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, status: code ?? 1 }); });
  });
}

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

  // Returns the user-set model for a web-UI session (set via /model command).
  // Returns null for CLI sessions not tracked by SessionManager.
  router.get("/sessions/:sessionId/model", (req, res) => {
    const { sessionId } = req.params;
    const sessionManager = state?.sessionManager;
    const activeSession = sessionManager?.getStatus(sessionId);
    res.json({ model: activeSession?.model ?? null });
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

      // Try metrics cache (keyed by filePath + size + mtime + subagentCount)
      let metrics!: ReturnType<typeof computeMetrics>;
      let allEvents!: SessionEvent[];
      let subagentMeta!: Map<string, { agentType: string; description: string }>;
      let cacheHit = false;

      // Count subagent files so cache invalidates when new subagents appear
      const subagentDir = join(session.path.replace(/\.jsonl$/, ""), "subagents");
      let subagentFileCount = 0;
      try {
        if (existsSync(subagentDir)) {
          subagentFileCount = readdirSync(subagentDir).filter(f => f.endsWith(".jsonl")).length;
        }
      } catch { /* ignore */ }

      // Compute authoritative session liveness BEFORE cache lookup — needed in the cache key
      // so a running→ended transition (no file change) causes a cache miss and DAG recompute.
      const sessionManager = state?.sessionManager;
      let sessionIsRunning: boolean;
      if (sessionManager) {
        const activeSession = sessionManager.getStatus(sessionId);
        if (activeSession) {
          sessionIsRunning = activeSession.status === "streaming" || activeSession.status === "waiting-permission";
        } else {
          const ageMs = Date.now() - new Date(session.lastModified).getTime();
          sessionIsRunning = ageMs < RUNNING_THRESHOLD_MS;
        }
      } else {
        const ageMs = Date.now() - new Date(session.lastModified).getTime();
        sessionIsRunning = ageMs < RUNNING_THRESHOLD_MS;
      }

      try {
        const stat = statSync(session.path);
        const cacheKey = { filePath: session.path, size: stat.size, mtimeMs: stat.mtimeMs, subagentCount: subagentFileCount, sessionIsRunning };
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
        // Check collector buffer first for remote sessions
        const collectorEvents = collectorBuffer.getEvents(sessionId);
        if (collectorEvents.length > 0) {
          const emptySubagentEvents = new Map<string, SessionEvent[]>();
          const emptySubagentMeta = new Map<string, { agentType: string; description: string }>();
          metrics = computeMetrics(session, collectorEvents, emptySubagentEvents, emptySubagentMeta);
          allEvents = collectorEvents;
          subagentMeta = emptySubagentMeta;
          return res.json({ metrics, events: allEvents, subagentMeta: {} });
        }

        const { mainEvents, subagentEvents, subagentMeta: loadedMeta } =
          loadFullSession(session);
        subagentMeta = loadedMeta;
        // For live SDK sessions, pass the authoritative context window from the session manager
        const sdkContextWindow = state?.sessionManager?.getContextWindow(session.id);
        metrics = computeMetrics(
          session,
          mainEvents,
          subagentEvents,
          subagentMeta,
          sdkContextWindow,
          sessionIsRunning,
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
            { filePath: session.path, size: stat.size, mtimeMs: stat.mtimeMs, subagentCount: subagentFileCount, sessionIsRunning },
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
        // Phase 3: synthetic agents have no own events; short-circuit before
        // discoverSessions / getAgentEvents which assume a real subagent.
        if (isSyntheticAgentId(agentId)) {
          return res.json({ events: [] });
        }
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
      const { toolName, input, sessionId, agentId, blockedPath, decisionReason } = req.body;
      const permission = addPermissionRequest({
        sessionId: sessionId || "",
        agentId: agentId || "main",
        toolName: toolName || "unknown",
        input: input || {},
        blockedPath,
        decisionReason,
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
      if (err instanceof Error && err.message.startsWith("cwd ")) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Fork an existing session (same cwd, new sessionId)
  router.post("/sessions/:sessionId/fork", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const sessionManager = state?.sessionManager;
      if (!sessionManager) {
        return res.status(500).json({ error: "Session manager not available" });
      }
      const sourceSession = sessionManager.getStatus(sessionId);
      if (!sourceSession) {
        return res.status(404).json({ error: "Session not found" });
      }
      const newSessionId = await sessionManager.startSession(sourceSession.cwd);
      logger.info({ sourceSessionId: sessionId, newSessionId, cwd: sourceSession.cwd }, "session forked");
      res.json({ sessionId: newSessionId });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("cwd ")) {
        return res.status(400).json({ error: err.message });
      }
      logger.error({ error: String(err) }, "Failed to fork session");
      res.status(500).json({ error: "Failed to fork session" });
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
        const msg = message as { type: string; uuid?: string; modelUsage?: Record<string, { contextWindow?: number }>; [key: string]: unknown };
        const sseEvents = mapSdkMessageToSSEEvents(msg);
        for (const sseEvent of sseEvents) {
          res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
        }

        // Extract authoritative context window from SDK result.modelUsage
        if (msg.type === "result" && msg.modelUsage) {
          let maxContextWindow = 0;
          for (const usage of Object.values(msg.modelUsage)) {
            if (usage.contextWindow && usage.contextWindow > maxContextWindow) {
              maxContextWindow = usage.contextWindow;
            }
          }
          if (maxContextWindow > 0) {
            sessionManager.setContextWindow(sessionId, maxContextWindow);
          }
          // Persist per-model context windows for future historical session lookups
          void updateModelContextWindows(
            msg.modelUsage as Record<string, { contextWindow: number }>
          );
        }

        // Immediately broadcast session events (assistant/user) via WebSocket
        // so all panels update without waiting for the file watcher's 200ms delay.
        // The client's UUID dedup handles the later watcher duplicate.
        if (state && (msg.type === "assistant" || msg.type === "user") && msg.uuid) {
          broadcast(state, buildNewEventsMessage(
            `live://${sessionId}`,
            [msg as unknown as SessionEvent],
          ));
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
      return res.status(400).json({ error: `Invalid mode: ${mode}. Must be one of: default, acceptEdits, bypassPermissions, plan, auto, dontAsk` });
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
    const validLevels = new Set(["low", "medium", "high", "xhigh", "max"]);
    if (!level || typeof level !== "string" || !validLevels.has(level)) {
      return res.status(400).json({ error: "level is required (low | medium | high | xhigh | max)" });
    }
    const sessionManager = state?.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({ error: "Session manager not available" });
    }
    const success = sessionManager.setEffortLevel(req.params.sessionId, level as EffortLevel);
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

  // Summarize earlier turns up to a selected user message (Rewind → "Summarize
  // up to here", CC v2.1.143 line 73). Counts the picked user turn from the
  // session JSONL and dispatches a bounded `/compact` with a summarization
  // hint pinned to that turn number. The dashboard receives the
  // compact_boundary back via SSE.
  router.post("/sessions/:sessionId/summarize-up-to", async (req, res) => {
    const { messageId } = req.body;
    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "messageId is required (string)" });
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
      const { turnNumber, stream } = await sessionManager.summarizeUpTo(
        req.params.sessionId,
        messageId
      );
      // Fire-and-forget: drain the SDK stream in the background so the HTTP
      // response returns immediately. SSE handlers downstream do the work.
      (async () => {
        try {
          for await (const _ of stream) {
            // intentionally drained
          }
        } catch (err) {
          // sendMessage already logs; nothing more to do here
          void err;
        }
      })();
      res.json({ ok: true, messageId, action: "compact-dispatched", turnNumber });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (detail.startsWith("Message ") || detail.startsWith("Session JSONL ")) {
        return res.status(404).json({ error: "Summarize failed", detail });
      }
      res.status(500).json({ error: "Summarize failed", detail });
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
      if (err instanceof Error && err.message.startsWith("cwd ")) {
        return res.status(400).json({ error: err.message });
      }
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
  router.post("/sessions/:sessionId/bash", async (req, res) => {
    try {
      // CSRF protection: reject requests from non-localhost origins
      const origin = req.get("origin") || req.get("referer") || "";
      if (origin && !origin.match(/^https?:\/\/localhost(:\d+)?/)) {
        return res.status(403).json({ error: "Cross-origin requests not allowed" });
      }

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

      const result = await spawnAsync("bash", ["-c", command], {
        cwd: session.cwd,
        timeout: 30000,
      });

      res.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to execute command" });
    }
  });

  // Get CLAUDE.md content from both user and project tiers
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

      // Read user-level CLAUDE.md (~/.claude/CLAUDE.md)
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const userPath = homeDir ? join(homeDir, ".claude", "CLAUDE.md") : "";
      let userContent: string | null = null;
      if (userPath) {
        try {
          await access(userPath);
          userContent = await readFile(userPath, "utf-8");
        } catch {
          // File doesn't exist or not readable
        }
      }

      // Read project-level CLAUDE.md ({cwd}/CLAUDE.md)
      const projectPath = cwd ? join(cwd, "CLAUDE.md") : "";
      let projectContent: string | null = null;
      if (projectPath) {
        try {
          await access(projectPath);
          projectContent = await readFile(projectPath, "utf-8");
        } catch {
          // File doesn't exist or not readable
        }
      }

      const tiers = [
        { name: "user", label: "User", path: userPath, content: userContent },
        { name: "project", label: "Project", path: projectPath, content: projectContent },
      ];

      // Backwards-compatible: content field is project-level content
      res.json({ content: projectContent, tiers });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to read CLAUDE.md");
      res.json({ content: null, tiers: [] });
    }
  });

  // Update CLAUDE.md content (user or project tier)
  router.put("/sessions/:projectHash/:sessionId/memory", async (req, res) => {
    try {
      const { projectHash, sessionId } = req.params;
      const { content, tier } = req.body;

      if (content === undefined || content === null || typeof content !== "string") {
        return res.status(400).json({ error: "content must be a string" });
      }

      if (tier !== undefined && tier !== "user" && tier !== "project") {
        return res.status(400).json({ error: "tier must be 'user' or 'project'" });
      }

      const sessions = discoverSessions();
      const session = sessions.find(
        (s) => s.projectHash === projectHash && s.id === sessionId
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      let claudeMdPath: string;
      if (tier === "user") {
        // Write to user-level CLAUDE.md (~/.claude/CLAUDE.md)
        const homeDir = process.env.HOME || process.env.USERPROFILE || "";
        if (!homeDir) {
          return res.status(400).json({ error: "Cannot determine home directory" });
        }
        claudeMdPath = join(homeDir, ".claude", "CLAUDE.md");
      } else {
        // Default: write to project-level CLAUDE.md
        const cwd = session.cwd;
        if (!cwd) {
          return res.status(400).json({ error: "Session has no working directory" });
        }
        claudeMdPath = join(cwd, "CLAUDE.md");
      }

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

  // P3: Stop background task
  router.post("/sessions/:sessionId/stop-task", (req, res) => {
    try {
      const { taskId } = req.body;
      if (!taskId || typeof taskId !== "string") {
        return res.status(400).json({ error: "taskId is required (string)" });
      }
      const sessionManager = state?.sessionManager;
      if (!sessionManager) {
        return res.status(500).json({ error: "Session manager not available" });
      }
      const session = sessionManager.getStatus(req.params.sessionId);
      if (!session?.activeQuery) {
        return res.status(404).json({ error: "No active query for session" });
      }
      const query = session.activeQuery as unknown as Record<string, unknown>;
      if (typeof query.stopTask === "function") {
        (query.stopTask as (id: string) => void)(taskId);
        res.json({ success: true });
      } else {
        res.status(501).json({ error: "stopTask not available on this SDK version" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to stop task" });
    }
  });

  // P3: Continue/resume session
  router.post("/sessions/:sessionId/continue", (req, res) => {
    try {
      const sessionManager = state?.sessionManager;
      if (!sessionManager) {
        return res.status(500).json({ error: "Session manager not available" });
      }
      const session = sessionManager.getStatus(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json({ success: true, message: "Session will continue on next message" });
    } catch (err) {
      res.status(500).json({ error: "Failed to set continue mode" });
    }
  });

  // Track additional directories per session (not on ActiveSession type — ephemeral)
  const sessionAdditionalDirs = new Map<string, string[]>();

  // P3: Add additional directory to session
  router.post("/sessions/:sessionId/add-dir", (req, res) => {
    try {
      const { directory } = req.body;
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory is required (string)" });
      }
      const resolved = resolve(directory);
      if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
        return res.status(400).json({ error: `Directory not found: ${resolved}` });
      }
      const sessionManager = state?.sessionManager;
      if (!sessionManager) {
        return res.status(500).json({ error: "Session manager not available" });
      }
      const session = sessionManager.getStatus(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const dirs = sessionAdditionalDirs.get(req.params.sessionId) || [];
      if (!dirs.includes(resolved)) {
        dirs.push(resolved);
        sessionAdditionalDirs.set(req.params.sessionId, dirs);
      }
      res.json({ success: true, directory: resolved, total: dirs.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to add directory" });
    }
  });

  // NEW-2 — Authoritative task state from the CC daemon's per-session task
  // store at `~/.claude/tasks/<sessionId>/<id>.json`. Returns an empty array
  // (not 404) when the directory does not exist so the dashboard can fall
  // back to the JSONL-derived task list without branching on HTTP status.
  router.get("/sessions/:sessionId/tasks/daemon", (req, res) => {
    try {
      const { sessionId } = req.params;
      const tasks = loadDaemonTasks(sessionId);
      res.json({ tasks });
    } catch (err) {
      logger.error(
        { error: String(err) },
        "Failed to load daemon tasks",
      );
      res.status(500).json({ error: "Failed to load daemon tasks" });
    }
  });

  return router;
}
