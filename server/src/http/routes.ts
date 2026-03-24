import { execSync } from "child_process";
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

  // Command input (v1: simple prompt)
  router.post("/command", async (req, res) => {
    const { prompt, cwd, sessionId } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const controller = new AbortController();
    // Use res.on("close") — fires when the client disconnects from the SSE stream.
    // req.on("close") fires when the POST body is fully received (too early — aborts the SDK).
    res.on("close", () => {
      controller.abort();
    });

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const responseStream = query({
        prompt,
        options: {
          abortController: controller,
          cwd: cwd || process.cwd(),
          resume: sessionId,
          forkSession: false,
          // Required for real-time streaming: without this flag, the SDK does not
          // emit stream_event (SDKPartialAssistantMessage) messages, so the client
          // receives no output until the turn completes.
          includePartialMessages: true,
          canUseTool: async (toolName, input) => {
            const permission = addPermissionRequest({
              sessionId: sessionId || "unknown",
              agentId: "main",
              toolName,
              input: input as Record<string, unknown>,
            });

            if (state) {
              broadcast(state, { type: "permission-request", permission });
            }

            return new Promise((resolve, reject) => {
              const check = setInterval(() => {
                const status = getPermissionStatus(permission.id);
                if (status?.status === "approved") {
                  clearInterval(check);
                  resolve({ behavior: "allow" });
                } else if (status?.status === "denied") {
                  clearInterval(check);
                  resolve({ behavior: "deny", message: "User denied permission" });
                }
              }, 500);

              // Clean up interval if request is aborted to avoid memory leak
              controller.signal.addEventListener("abort", () => {
                clearInterval(check);
                reject(new Error("Aborted"));
              }, { once: true });
            });
          }
        }
      });

      for await (const message of responseStream) {
        if (message.type === "stream_event") {
          // SDKPartialAssistantMessage: real-time streaming text deltas
          // Only emitted when includePartialMessages: true is set.
          const event = message.event as { type: string; delta?: { type: string; text?: string } };
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            res.write(
              `data: ${JSON.stringify({ type: "stdout", text: event.delta.text })}\n\n`
            );
          }
        } else if (message.type === "assistant") {
          // SDKAssistantMessage: emitted at end of each turn with full response.
          // Extract text blocks as fallback (covers non-streaming or resumed sessions).
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                res.write(
                  `data: ${JSON.stringify({ type: "stdout", text: block.text })}\n\n`
                );
              }
            }
          }
        } else if (message.type === "result") {
          // SDKResultMessage: emitted at end of query with final cost/usage info.
          // Surface any execution errors from is_error flag or error subtypes.
          if (message.is_error) {
            const errMsg = "subtype" in message ? String(message.subtype) : "Execution error";
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

  return router;
}
