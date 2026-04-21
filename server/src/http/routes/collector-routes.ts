import { Router } from "express";
import type { RouteContext } from "./route-context.js";

export function createCollectorRoutes({ state }: RouteContext): Router {
  const router = Router();

  router.get("/collectors", (_req, res) => {
    const hub = state?.collectorHub;
    if (!hub) {
      res.json({ collectors: [] });
      return;
    }
    const collectors = hub.getConnectedCollectors().map((c) => ({
      source: c.source,
      connectedAt: c.connectedAt.toISOString(),
      lastSeen: c.lastSeen.toISOString(),
      sessionCount: c.sessionCount,
      status: "connected",
    }));
    res.json({ collectors });
  });

  return router;
}
