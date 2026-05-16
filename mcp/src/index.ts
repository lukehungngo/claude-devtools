#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const srv = buildServer();
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  logger.info("claude-devtools-mcp ready");
}

main().catch((err: unknown) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
