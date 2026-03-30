import { Router } from "express";
import type { RouteContext } from "./route-context.js";

export function createDebugRoutes({ state }: RouteContext): Router {
  const router = Router();

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
