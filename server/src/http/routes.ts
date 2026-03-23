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
import { sessionManager } from "../sessions/session-manager.js";
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
      if (!result) {
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

  // Command input — uses Agent SDK to fork + resume sessions
  router.post("/command", async (req, res) => {
    const { prompt, cwd, sessionId } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId — cannot send prompt without a session to fork from" });
    }

    // Wire up session manager to server state for WS broadcasts
    if (state) {
      sessionManager.setState(state);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    try {
      const query = await sessionManager.sendPrompt(
        sessionId,
        prompt,
        cwd || process.cwd()
      );

      // Clean up on client disconnect
      req.on("close", () => {
        sessionManager.closeSession(sessionId);
      });

      // Stream SDK messages as SSE events
      for await (const message of query) {
        const sseData = sdkMessageToSSE(message);
        if (sseData) {
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      res.write(
        `data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`
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

// ─── SDK message → SSE event adapter ────────────────────────────────

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

function sdkMessageToSSE(msg: import("../sessions/session-manager.js").SDKMessage): SSEEvent | null {
  switch (msg.type) {
    case "assistant": {
      // Extract text content from assistant message
      const textParts = (msg.message?.content || [])
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { type: string; text?: string }) => c.text || "");
      const toolUses = (msg.message?.content || [])
        .filter((c: { type: string }) => c.type === "tool_use")
        .map((c: { type: string; name?: string; input?: unknown }) => ({
          name: c.name,
          input: c.input,
        }));
      return {
        type: "assistant",
        text: textParts.join(""),
        toolUses,
        sessionId: msg.session_id,
      };
    }
    case "result":
      return {
        type: "result",
        subtype: msg.subtype,
        cost: "cost_usd" in msg ? msg.cost_usd : undefined,
        duration: "duration_ms" in msg ? msg.duration_ms : undefined,
        sessionId: msg.session_id,
      };
    case "system":
      if (msg.subtype === "init") {
        return {
          type: "system",
          subtype: "init",
          sessionId: msg.session_id,
        };
      }
      return null;
    case "stream_event":
      // Partial assistant message — forward for live streaming
      return {
        type: "stream",
        text:
          "content_block_delta" in msg
            ? (msg as Record<string, unknown>).content_block_delta
            : undefined,
      };
    default:
      // Forward other message types with minimal info
      return {
        type: msg.type,
        sessionId: "session_id" in msg ? msg.session_id : undefined,
      };
  }
}
