import { Router, json } from "express";
import type { ServerState } from "./server.js";
import { createSessionRoutes } from "./routes/session-routes.js";
import { createSettingsRoutes } from "./routes/settings-routes.js";
import { createMcpRoutes } from "./routes/mcp-routes.js";
import { createDiscoveryRoutes } from "./routes/discovery-routes.js";
import { createDebugRoutes } from "./routes/debug-routes.js";

export function setupRoutes(state?: ServerState): Router {
  const router = Router();
  router.use(json());

  const context = { state };

  // Mount sub-routers (order matters: discovery routes with :sessionId params
  // must come before session routes with :projectHash/:sessionId to avoid collision)
  router.use(createDiscoveryRoutes(context));
  router.use(createSessionRoutes(context));
  router.use(createSettingsRoutes());
  router.use(createMcpRoutes(context));
  router.use(createDebugRoutes(context));

  return router;
}
