import { z } from "zod";
import { RangeSchema, ProjectSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { buildToolStats } from "claude-devtools-server/src/analyzer/tool-stats.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";

const Input = z.object({
  range: RangeSchema,
  project: ProjectSchema,
});

export const toolUsageBreakdownTool: ToolDefinition = {
  name: "tool_usage_breakdown",
  description: "Tool usage stats (calls, errors) aggregated across sessions.",
  inputSchema: {
    type: "object",
    properties: {
      range: { type: "string", enum: ["24h", "7d", "30d", "90d", "all"] },
      project: { type: "string" },
    },
    required: ["range"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const sessions = listSessions({ range: parsed.data.range, project: parsed.data.project });
    const aggregate = new Map<string, { calls: number; errors: number }>();

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      const stats = buildToolStats(events);
      for (const stat of stats) {
        const entry = aggregate.get(stat.name) ?? { calls: 0, errors: 0 };
        entry.calls += stat.count;
        entry.errors += stat.errors;
        aggregate.set(stat.name, entry);
      }
    }

    const items = Array.from(aggregate.entries())
      .map(([tool, data]) => ({
        tool,
        calls: data.calls,
        errors: data.errors,
        errorRate: data.calls > 0 ? data.errors / data.calls : 0,
      }))
      .sort((a, b) => b.calls - a.calls);

    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};

registerTool(toolUsageBreakdownTool);
