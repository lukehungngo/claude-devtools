import { execSync } from "child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Router, json } from "express";
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
} from "../hooks/permission-handler.js";
import { buildLifecycleRecords } from "../debug/lifecycle-builder.js";
import type { SessionEvent } from "../types.js";
import type { ServerState } from "./server.js";
import { broadcast } from "./server.js";

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

      const { mainEvents, subagentEvents, subagentMeta } =
        loadFullSession(session);
      const metrics = computeMetrics(
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
      const allEvents = [...mainEvents, ...allSubEvents].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

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
          console.warn("[debug-db] Failed to store lifecycle data:", err);
        }
      }

      res.json({ metrics, events: allEvents, subagentMeta: subagentMetaObj });
    } catch (err) {
      res.status(500).json({ error: "Failed to load session" });
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
      const { decision } = req.body; // "approved" | "denied"
      const result = resolvePermissionRequest(req.params.id, decision);

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
    const { prompt } = req.body;
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
      for await (const message of sessionManager.sendMessage(sessionId, prompt)) {
        const msg = message as {
          type: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          event?: any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          message?: any;
          is_error?: boolean;
          subtype?: string;
        };

        if (msg.type === "stream_event") {
          const event = msg.event as {
            type: string;
            delta?: { type: string; text?: string };
          };
          if (
            event?.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta.text
          ) {
            res.write(
              `data: ${JSON.stringify({ type: "stdout", text: event.delta.text })}\n\n`
            );
          }
        } else if (msg.type === "assistant") {
          const content = msg.message?.content as
            | Array<{ type: string; text?: string }>
            | undefined;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                res.write(
                  `data: ${JSON.stringify({ type: "stdout", text: block.text })}\n\n`
                );
              }
            }
          }
        } else if (msg.type === "result") {
          if (msg.is_error) {
            const errMsg = msg.subtype
              ? String(msg.subtype)
              : "Execution error";
            res.write(
              `data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`
            );
          }
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

      // Security: reject shell metacharacters to prevent injection via execSync
      // Allow only [a-zA-Z0-9_\-.\/] — no quotes, semicolons, backticks, etc.
      if (/[^a-zA-Z0-9_\-./]/.test(filePath)) {
        res.status(400).json({ error: "Invalid file path" });
        return;
      }

      // Try VS Code first, then fall back to $EDITOR
      const lineArg = line ? `:${line}` : "";
      try {
        execSync(`code --goto "${filePath}${lineArg}"`, { timeout: 5000 });
        res.json({ success: true, editor: "vscode" });
      } catch {
        const editor = process.env.EDITOR || "vim";
        // Validate EDITOR against shell metacharacters to prevent injection
        if (/[;&|`$(){}!#]/.test(editor)) {
          res.status(500).json({ error: "EDITOR env var contains invalid shell metacharacters" });
          return;
        }
        try {
          execSync(`${editor} "${filePath}"`, { timeout: 5000 });
          res.json({ success: true, editor });
        } catch {
          res.status(500).json({ error: "No editor available" });
        }
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to open file" });
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

  return router;
}
