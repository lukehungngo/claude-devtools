import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { allToolDefinitions } from "./tools/registry.js";
import { registerPrompts } from "./prompts/registry.js";
import { registerResources } from "./resources/registry.js";
// Import prompts to trigger registration
import "./prompts/perf-review.js";
import "./prompts/cost-audit.js";
import "./prompts/anti-pattern-check.js";
import "./prompts/session-postmortem.js";
import "./prompts/weekly-summary.js";
// Import resources to trigger registration
import "./resources/anti-pattern-catalog.js";
import "./resources/baseline-project.js";
import "./resources/report-latest.js";
// Import all tools to trigger registration
import "./tools/list-sessions.js";
import "./tools/get-session.js";
import "./tools/search-sessions.js";
import "./tools/usage-summary.js";
import "./tools/cost-by-project.js";
import "./tools/model-distribution.js";
import "./tools/cache-hit-trends.js";
import "./tools/token-timeline.js";
import "./tools/tool-usage-breakdown.js";
import "./tools/edit-to-read-ratio.js";
import "./tools/retry-loops-detected.js";
import "./tools/subagent-fanout.js";
import "./tools/longest-sessions.js";
import "./tools/error-rate.js";
import "./tools/unfinished-sessions.js";

export function buildServer(): Server {
  const srv = new Server(
    { name: "claude-devtools-mcp", version: "0.0.1" },
    { capabilities: { tools: {}, prompts: {}, resources: {} } },
  );

  const defs = allToolDefinitions();

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: defs.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  srv.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = defs.find((d) => d.name === req.params.name);
    if (!def) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: `UNKNOWN_TOOL: ${req.params.name}` }) },
        ],
        isError: true,
      };
    }
    try {
      const result = await def.handler(req.params.arguments ?? {});
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  // Register prompts
  registerPrompts(srv);

  // Register resources
  registerResources(srv);

  return srv;
}
