import { Router, json } from "express";
import { discoverSessions, loadFullSession } from "../parser/session-discovery.js";
import { computeMetrics } from "../analyzer/metrics.js";
import type { SessionInfo } from "../types.js";

export function setupRoutes(): Router {
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

      res.json({ metrics, events: mainEvents });
    } catch (err) {
      res.status(500).json({ error: "Failed to load session" });
    }
  });

  // Command input (v1: simple prompt)
  router.post("/command", async (req, res) => {
    const { prompt, cwd } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    try {
      const { spawn } = await import("node:child_process");
      const child = spawn("claude", ["-p", prompt], {
        cwd: cwd || process.cwd(),
        env: { ...process.env },
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      child.stdout.on("data", (data: Buffer) => {
        res.write(`data: ${JSON.stringify({ type: "stdout", text: data.toString() })}\n\n`);
      });

      child.stderr.on("data", (data: Buffer) => {
        res.write(`data: ${JSON.stringify({ type: "stderr", text: data.toString() })}\n\n`);
      });

      child.on("close", (code) => {
        res.write(`data: ${JSON.stringify({ type: "done", exitCode: code })}\n\n`);
        res.end();
      });

      child.on("error", (err) => {
        res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
        res.end();
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to execute command" });
    }
  });

  return router;
}
