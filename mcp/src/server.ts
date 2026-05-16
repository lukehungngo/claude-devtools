import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function buildServer(): McpServer {
  const srv = new McpServer(
    { name: "claude-devtools-mcp", version: "0.0.1" },
    { capabilities: { tools: {}, prompts: {}, resources: {} } },
  );
  return srv;
}
