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

const Input = z.object({ range: RangeSchema });

export const modelDistributionTool: ToolDefinition = {
  name: "model_distribution",
  description: "Token and cost distribution across models.",
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
    const models = new Map<string, { requests: number; tokens: number; cost: number }>();
    let totalTokens = 0;

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      for (const e of events) {
        if (e.type === "assistant") {
          const ae = e as AssistantEvent;
          const usage = ae.message.usage;
          if (!usage) continue;
          const model = ae.message.model || "unknown";
          const inTok = usage.input_tokens || 0;
          const outTok = usage.output_tokens || 0;
          const tok = inTok + outTok;
          totalTokens += tok;
          const entry = models.get(model) ?? { requests: 0, tokens: 0, cost: 0 };
          entry.requests += 1;
          entry.tokens += tok;
          entry.cost += calculateTokenCost(model, {
            inputTokens: inTok,
            outputTokens: outTok,
            cacheWriteTokens: usage.cache_creation_input_tokens || 0,
            cacheReadTokens: usage.cache_read_input_tokens || 0,
          });
          models.set(model, entry);
        }
      }
    }

    const items = Array.from(models.entries())
      .map(([model, data]) => ({
        model,
        ...data,
        pct: totalTokens > 0 ? data.tokens / totalTokens : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};

registerTool(modelDistributionTool);
