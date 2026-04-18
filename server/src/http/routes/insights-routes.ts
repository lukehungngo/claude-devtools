import { Router } from "express";
import { discoverSessions } from "../../parser/session-discovery.js";
import { computeInsightsAggregate } from "../../analyzer/insights-aggregator.js";
import type { InsightsTimeRange } from "../../types.js";
import type { RouteContext } from "./route-context.js";

const VALID_TIME_RANGES = new Set<string>(["24h", "7d", "30d", "90d", "all"]);

export function createInsightsRoutes(_ctx: RouteContext): Router {
  const router = Router();

  router.get("/api/insights/aggregate", (req, res) => {
    const timeRange = (req.query.timeRange as string) ?? "7d";
    const repo = (req.query.repo as string) ?? "all";

    if (!VALID_TIME_RANGES.has(timeRange)) {
      res.status(400).json({
        error: `Invalid timeRange. Must be one of: ${[...VALID_TIME_RANGES].join(", ")}`,
      });
      return;
    }

    try {
      const sessions = discoverSessions();
      const aggregate = computeInsightsAggregate(
        sessions,
        timeRange as InsightsTimeRange,
        repo
      );
      res.json(aggregate);
    } catch (err) {
      res.status(500).json({ error: "Failed to compute insights aggregate" });
    }
  });

  return router;
}
