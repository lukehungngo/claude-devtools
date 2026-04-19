import { Router } from "express";
import { discoverSessions } from "../../parser/session-discovery.js";
import { computeInsightsAggregate } from "../../analyzer/insights-aggregator.js";
import { computeInsightsActivity } from "../../analyzer/activity-aggregator.js";
import { computeInsightsModelMix } from "../../analyzer/insights-model-mix.js";
import { computeInsightsTopConsumers } from "../../analyzer/insights-top-consumers.js";
import type { InsightsTimeRange } from "../../types.js";
import type { RouteContext } from "./route-context.js";

const VALID_TIME_RANGES = new Set<string>(["24h", "7d", "30d", "90d", "all"]);

export function createInsightsRoutes(_ctx: RouteContext): Router {
  const router = Router();

  router.get("/insights/aggregate", (req, res) => {
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
    } catch {
      res.status(500).json({ error: "Failed to compute insights aggregate" });
    }
  });

  router.get("/insights/activity", (req, res) => {
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
      const activity = computeInsightsActivity(
        sessions,
        timeRange as InsightsTimeRange,
        repo
      );
      res.json(activity);
    } catch {
      res.status(500).json({ error: "Failed to compute insights activity" });
    }
  });

  router.get("/insights/model-mix", (req, res) => {
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
      const modelMix = computeInsightsModelMix(
        sessions,
        timeRange as InsightsTimeRange,
        repo
      );
      res.json(modelMix);
    } catch {
      res.status(500).json({ error: "Failed to compute model mix" });
    }
  });

  router.get("/insights/top-consumers", (req, res) => {
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
      const topConsumers = computeInsightsTopConsumers(
        sessions,
        timeRange as InsightsTimeRange,
        repo
      );
      res.json(topConsumers);
    } catch {
      res.status(500).json({ error: "Failed to compute top consumers" });
    }
  });

  return router;
}
