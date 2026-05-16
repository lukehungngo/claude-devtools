import { z } from "zod";
import { RangeSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";
import type { UserEvent, ContentItem } from "claude-devtools-server/src/types.js";

const Input = z.object({
  range: RangeSchema,
  group_by: z.enum(["tool", "project"]).default("tool"),
});

export const errorRateTool: ToolDefinition = {
  name: "error_rate",
  description: "Error rate grouped by tool or project. Errors from tool_result.is_error in user events.",
  inputSchema: {
    type: "object",
    properties: {
      range: { type: "string", enum: ["24h", "7d", "30d", "90d", "all"] },
      group_by: { type: "string", enum: ["tool", "project"] },
    },
    required: ["range"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const sessions = listSessions({ range: parsed.data.range });
    const stats = new Map<string, { totalCalls: number; errors: number }>();

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      // Track tool_use names by their id so we can attribute errors
      const toolUseNames = new Map<string, string>();

      for (const e of events) {
        if (e.type === "assistant") {
          const content = e.message.content;
          if (!Array.isArray(content)) continue;
          for (const item of content as ContentItem[]) {
            if (item.type === "tool_use") {
              toolUseNames.set(item.id, item.name);
            }
          }
        } else if (e.type === "user") {
          const ue = e as UserEvent;
          const content = ue.message.content;
          if (!Array.isArray(content)) continue;
          for (const item of content as ContentItem[]) {
            if (item.type === "tool_result") {
              const key =
                parsed.data.group_by === "tool"
                  ? toolUseNames.get(item.tool_use_id) ?? "unknown"
                  : s.projectHash;
              const entry = stats.get(key) ?? { totalCalls: 0, errors: 0 };
              entry.totalCalls++;
              if (item.is_error) entry.errors++;
              stats.set(key, entry);
            }
          }
        }
      }
    }

    const items = Array.from(stats.entries())
      .map(([key, data]) => ({
        key,
        totalCalls: data.totalCalls,
        errors: data.errors,
        rate: data.totalCalls > 0 ? data.errors / data.totalCalls : 0,
      }))
      .sort((a, b) => b.rate - a.rate);

    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};

registerTool(errorRateTool);
