import { z } from "zod";
import { RangeSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { calculateTokenCost } from "claude-devtools-server/src/analyzer/metrics.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";
import type { AssistantEvent } from "claude-devtools-server/src/types.js";

const Input = z.object({
  range: RangeSchema,
  group_by: z.enum(["day", "project", "model"]).default("day"),
});

export const usageSummaryTool: ToolDefinition = {
  name: "usage_summary",
  description:
    "Aggregate usage stats grouped by day, project, or model over a time range.",
  inputSchema: {
    type: "object",
    properties: {
      range: { type: "string", enum: ["24h", "7d", "30d", "90d", "all"] },
      group_by: { type: "string", enum: ["day", "project", "model"] },
    },
    required: ["range"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const sessions = listSessions({ range: parsed.data.range });
    const buckets = new Map<string, { tokens: number; cost: number; sessions: number }>();

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      let sessionTokens = 0;
      let sessionCost = 0;
      let groupKey = "";

      for (const e of events) {
        if (e.type === "assistant") {
          const ae = e as AssistantEvent;
          const usage = ae.message.usage;
          if (!usage) continue;
          const model = ae.message.model || "unknown";
          const inTok = usage.input_tokens || 0;
          const outTok = usage.output_tokens || 0;
          const cacheWrite = usage.cache_creation_input_tokens || 0;
          const cacheRead = usage.cache_read_input_tokens || 0;
          sessionTokens += inTok + outTok;
          sessionCost += calculateTokenCost(model, {
            inputTokens: inTok,
            outputTokens: outTok,
            cacheWriteTokens: cacheWrite,
            cacheReadTokens: cacheRead,
          });

          if (parsed.data.group_by === "model") {
            groupKey = model;
            const b = buckets.get(groupKey) ?? { tokens: 0, cost: 0, sessions: 0 };
            b.tokens += inTok + outTok;
            b.cost += calculateTokenCost(model, {
              inputTokens: inTok, outputTokens: outTok,
              cacheWriteTokens: cacheWrite, cacheReadTokens: cacheRead,
            });
            buckets.set(groupKey, b);
          }
        }
      }

      if (parsed.data.group_by === "day") {
        groupKey = s.lastModified.slice(0, 10);
      } else if (parsed.data.group_by === "project") {
        groupKey = s.projectHash;
      }

      if (parsed.data.group_by !== "model") {
        const b = buckets.get(groupKey) ?? { tokens: 0, cost: 0, sessions: 0 };
        b.tokens += sessionTokens;
        b.cost += sessionCost;
        b.sessions += 1;
        buckets.set(groupKey, b);
      } else {
        // Increment session count for all model keys seen
        for (const [, b] of buckets) {
          // Already incremented cost/tokens inline
          b.sessions = sessions.length; // approximation
        }
      }
    }

    const result = Array.from(buckets.entries())
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => b.cost - a.cost);

    return scrubSecrets(capPayload({ buckets: result }, cfg.payloadCapBytes));
  },
};

registerTool(usageSummaryTool);
