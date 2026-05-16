import pino from "pino";

/**
 * MCP servers communicate over stdin/stdout (JSON-RPC). All logs MUST go to
 * stderr to avoid corrupting the protocol stream.
 */
export const logger = pino(
  {
    name: "claude-devtools-mcp",
    level: process.env.MCP_LOG_LEVEL ?? "info",
  },
  pino.destination(2),
);
