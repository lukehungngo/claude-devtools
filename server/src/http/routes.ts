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

  // Command input (v1: simple prompt)
  router.post("/command", async (req, res) => {
    const { prompt, cwd, sessionId } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    try {
      const { spawn } = await import("node:child_process");
      const args = sessionId ? ["--resume", sessionId, "-p", prompt] : ["-p", prompt];
      const child = spawn("claude", args, {
        cwd: cwd || process.cwd(),
        env: { ...process.env },
      });

      child.stdin.end();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      req.on("close", () => {
        child.kill();
      });

      child.stdout.on("data", (data: Buffer) => {
        res.write(
          `data: ${JSON.stringify({ type: "stdout", text: data.toString() })}\n\n`
        );
      });

      child.stderr.on("data", (data: Buffer) => {
        res.write(
          `data: ${JSON.stringify({ type: "stderr", text: data.toString() })}\n\n`
        );
      });

      child.on("close", (code) => {
        res.write(
          `data: ${JSON.stringify({ type: "done", exitCode: code })}\n\n`
        );
        res.end();
      });

      child.on("error", (err) => {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
        );
        res.end();
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to execute command" });
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
