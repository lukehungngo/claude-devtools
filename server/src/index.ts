import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { openDashboard } from "./tools/open-dashboard.js";
import { listSessions } from "./tools/session-list.js";

const server = new Server(
  { name: "claude-devtools", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "open-dashboard",
      description:
        "Open the Claude DevTools dashboard in the browser. Shows agent flow visualization, token/cost metrics, tool usage stats, and session timeline.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "list-sessions",
      description:
        "List recent Claude Code sessions with event counts and metadata.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Max sessions to return (default 20)",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  switch (name) {
    case "open-dashboard": {
      const result = await openDashboard();
      return { content: [{ type: "text" as const, text: result }] };
    }
    case "list-sessions": {
      const result = listSessions();
      return { content: [{ type: "text" as const, text: result }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude DevTools MCP server running");
}

main().catch(console.error);
