import { readFile, writeFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Router } from "express";
import { logger } from "../../logger.js";
import type { RouteContext } from "./route-context.js";

/** Helper: read MCP servers from settings.json (static fallback) */
async function readMcpFromSettings(): Promise<Array<{ name: string; command: string | null; args: string[]; status: string; toolCount: number }>> {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  try {
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    const mcpServers = settings.mcpServers ?? {};
    return Object.entries(mcpServers).map(([name, config]) => {
      const cfg = config as Record<string, unknown>;
      return {
        name,
        command: (cfg.command as string) ?? null,
        args: Array.isArray(cfg.args) ? (cfg.args as string[]) : [],
        status: "configured",
        toolCount: 0,
      };
    });
  } catch {
    return [];
  }
}

/** Helper: resolve the .mcp.json path for a project */
function resolveMcpJsonPath(projectPath?: string): string {
  if (projectPath) {
    return join(projectPath, ".mcp.json");
  }
  return join(homedir(), ".claude.json");
}

export function createMcpRoutes({ state }: RouteContext): Router {
  const router = Router();

  // MCP server list from settings
  router.get("/mcp/servers", async (_req, res) => {
    try {
      const servers = await readMcpFromSettings();
      res.json({ servers });
    } catch {
      res.json({ servers: [] });
    }
  });

  // Get MCP server status for a session (uses SDK if available, else settings.json)
  router.get("/sessions/:sessionId/mcp/status", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = state?.sessionManager?.getStatus(sessionId);

      // If there's an active query with mcpServerStatus, use it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeQuery = session?.activeQuery as any;
      if (activeQuery && typeof activeQuery.mcpServerStatus === "function") {
        try {
          const status = await activeQuery.mcpServerStatus();
          return res.json({ servers: status, source: "sdk" });
        } catch {
          // Fall through to settings.json
        }
      }

      // Fallback: read from settings.json
      const servers = readMcpFromSettings();
      res.json({ servers, source: "settings" });
    } catch {
      res.json({ servers: [], source: "error" });
    }
  });

  // Toggle MCP server enabled/disabled (requires active query)
  router.post("/sessions/:sessionId/mcp/toggle", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { serverName, enabled } = req.body;

      if (!serverName || typeof serverName !== "string") {
        return res.status(400).json({ error: "serverName is required (string)" });
      }
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled is required (boolean)" });
      }

      const session = state?.sessionManager?.getStatus(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeQuery = session.activeQuery as any;
      if (!activeQuery || typeof activeQuery.toggleMcpServer !== "function") {
        return res.status(400).json({ error: "No active query. Toggle requires an active streaming session." });
      }

      await activeQuery.toggleMcpServer(serverName, enabled);
      res.json({ success: true, serverName, enabled });
    } catch (err) {
      res.status(500).json({ error: "Failed to toggle MCP server" });
    }
  });

  // Reconnect MCP server (requires active query)
  router.post("/sessions/:sessionId/mcp/reconnect", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { serverName } = req.body;

      if (!serverName || typeof serverName !== "string") {
        return res.status(400).json({ error: "serverName is required (string)" });
      }

      const session = state?.sessionManager?.getStatus(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeQuery = session.activeQuery as any;
      if (!activeQuery || typeof activeQuery.reconnectMcpServer !== "function") {
        return res.status(400).json({ error: "No active query. Reconnect requires an active streaming session." });
      }

      await activeQuery.reconnectMcpServer(serverName);
      res.json({ success: true, serverName });
    } catch (err) {
      res.status(500).json({ error: "Failed to reconnect MCP server" });
    }
  });

  // Add a new MCP server
  router.post("/mcp/servers", async (req, res) => {
    try {
      const { name, command, args, env, projectPath } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "name is required (string)" });
      }
      if (!command || typeof command !== "string") {
        return res.status(400).json({ error: "command is required (string)" });
      }

      const mcpPath = resolveMcpJsonPath(projectPath);
      let config: Record<string, unknown> = {};

      try {
        await access(mcpPath);
        try {
          config = JSON.parse(await readFile(mcpPath, "utf-8"));
        } catch {
          return res.status(500).json({ error: "Failed to parse existing .mcp.json" });
        }
      } catch {
        // File doesn't exist, start with empty config
      }

      const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;

      if (mcpServers[name]) {
        return res.status(409).json({ error: `Server "${name}" already exists` });
      }

      const serverEntry: Record<string, unknown> = {
        command,
        args: Array.isArray(args) ? args : [],
      };
      if (env && typeof env === "object" && !Array.isArray(env)) {
        serverEntry.env = env;
      }

      mcpServers[name] = serverEntry;
      config.mcpServers = mcpServers;

      await writeFile(mcpPath, JSON.stringify(config, null, 2) + "\n");
      logger.info({ name, mcpPath }, "Added MCP server");

      res.json({ success: true, server: { name, command, args: serverEntry.args, env: serverEntry.env } });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to add MCP server");
      res.status(500).json({ error: "Failed to add MCP server" });
    }
  });

  // Remove an MCP server
  router.delete("/mcp/servers/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const { projectPath } = req.body ?? {};

      const mcpPath = resolveMcpJsonPath(projectPath);

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(await readFile(mcpPath, "utf-8"));
      } catch {
        return res.status(404).json({ error: `Server "${name}" not found (no .mcp.json)` });
      }

      const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;
      if (!mcpServers[name]) {
        return res.status(404).json({ error: `Server "${name}" not found` });
      }

      delete mcpServers[name];
      config.mcpServers = mcpServers;

      await writeFile(mcpPath, JSON.stringify(config, null, 2) + "\n");
      logger.info({ name, mcpPath }, "Removed MCP server");

      res.json({ success: true, name });
    } catch (err) {
      logger.error({ error: String(err) }, "Failed to remove MCP server");
      res.status(500).json({ error: "Failed to remove MCP server" });
    }
  });

  return router;
}
