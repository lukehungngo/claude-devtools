import { z } from "zod";
import { RangeSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";
import type { AssistantEvent, ContentItem } from "claude-devtools-server/src/types.js";

const Input = z.object({ range: RangeSchema });

function stableKey(name: string, input: unknown): string {
  return `${name}:${JSON.stringify(input)}`;
}

export const retryLoopsDetectedTool: ToolDefinition = {
  name: "retry_loops_detected",
  description: "Detect retry loops: same tool+args called 3+ times consecutively.",
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
    const loops: Array<{
      sessionId: string;
      tool: string;
      count: number;
      firstAt: string;
      lastAt: string;
    }> = [];

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      let prevKey = "";
      let runCount = 0;
      let firstAt = "";
      let lastAt = "";
      let toolName = "";

      for (const e of events) {
        if (e.type !== "assistant") continue;
        const ae = e as AssistantEvent;
        const content = ae.message.content;
        if (!Array.isArray(content)) continue;

        for (const item of content as ContentItem[]) {
          if (item.type !== "tool_use") continue;
          const key = stableKey(item.name, item.input);
          if (key === prevKey) {
            runCount++;
            lastAt = ae.timestamp;
          } else {
            if (runCount >= 3) {
              loops.push({ sessionId: s.id, tool: toolName, count: runCount, firstAt, lastAt });
            }
            prevKey = key;
            runCount = 1;
            firstAt = ae.timestamp;
            lastAt = ae.timestamp;
            toolName = item.name;
          }
        }
      }
      // Final check
      if (runCount >= 3) {
        loops.push({ sessionId: s.id, tool: toolName, count: runCount, firstAt, lastAt });
      }
    }

    return scrubSecrets(capPayload({ items: loops }, cfg.payloadCapBytes));
  },
};

registerTool(retryLoopsDetectedTool);
