import { z } from "zod";
import { RangeSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";
import type { AssistantEvent } from "claude-devtools-server/src/types.js";

const Input = z.object({ range: RangeSchema });

export const cacheHitTrendsTool: ToolDefinition = {
  name: "cache_hit_trends",
  description: "Cache hit rate trends bucketed by day.",
  inputSchema: {
    type: "object",
    properties: {
      range: { type: "string", enum: ["24h", "7d", "30d", "90d", "all"] },
    },
    required: ["range"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const sessions = listSessions({ range: parsed.data.range });
    const days = new Map<string, { cacheReadTokens: number; cacheCreationTokens: number; inputTokens: number }>();

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      for (const e of events) {
        if (e.type === "assistant") {
          const ae = e as AssistantEvent;
          const usage = ae.message.usage;
          if (!usage) continue;
          const day = ae.timestamp.slice(0, 10);
          const entry = days.get(day) ?? { cacheReadTokens: 0, cacheCreationTokens: 0, inputTokens: 0 };
          entry.cacheReadTokens += usage.cache_read_input_tokens || 0;
          entry.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
          entry.inputTokens += usage.input_tokens || 0;
          days.set(day, entry);
        }
      }
    }

    const buckets = Array.from(days.entries())
      .map(([day, d]) => {
        const total = d.cacheReadTokens + d.cacheCreationTokens + d.inputTokens;
        return {
          day,
          cacheReadTokens: d.cacheReadTokens,
          cacheCreationTokens: d.cacheCreationTokens,
          hitRate: total > 0 ? d.cacheReadTokens / total : 0,
        };
      })
      .sort((a, b) => a.day.localeCompare(b.day));

    return scrubSecrets(capPayload({ buckets }, cfg.payloadCapBytes));
  },
};

registerTool(cacheHitTrendsTool);
