import { z } from "zod";
import { SessionIdSchema } from "./schemas.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { calculateTokenCost } from "claude-devtools-server/src/analyzer/metrics.js";
import { findSessionPath } from "../security/path-guard.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";
import type { AssistantEvent } from "claude-devtools-server/src/types.js";

const Input = z.object({ session_id: SessionIdSchema });

export const tokenTimelineTool: ToolDefinition = {
  name: "token_timeline",
  description: "Token usage over time for a single session.",
  inputSchema: {
    type: "object",
    properties: { session_id: { type: "string" } },
    required: ["session_id"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const filePath = findSessionPath(cfg.projectsDir, parsed.data.session_id);
    const events = parseJsonlFile(filePath);

    let cumulativeCost = 0;
    const points: Array<{
      t: string;
      inputTokens: number;
      outputTokens: number;
      cumulativeCost: number;
    }> = [];

    for (const e of events) {
      if (e.type === "assistant") {
        const ae = e as AssistantEvent;
        const usage = ae.message.usage;
        if (!usage) continue;
        const model = ae.message.model || "unknown";
        const inTok = usage.input_tokens || 0;
        const outTok = usage.output_tokens || 0;
        cumulativeCost += calculateTokenCost(model, {
          inputTokens: inTok,
          outputTokens: outTok,
          cacheWriteTokens: usage.cache_creation_input_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
        });
        points.push({
          t: ae.timestamp,
          inputTokens: inTok,
          outputTokens: outTok,
          cumulativeCost,
        });
      }
    }

    return scrubSecrets(
      capPayload({ id: parsed.data.session_id, points }, cfg.payloadCapBytes),
    );
  },
};

registerTool(tokenTimelineTool);
