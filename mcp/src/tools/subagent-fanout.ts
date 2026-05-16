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

export const subagentFanoutTool: ToolDefinition = {
  name: "subagent_fanout",
  description: "Analyze subagent/Task tool fanout (depth and breadth) per session.",
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
    const items: Array<{ sessionId: string; taskCalls: number; breadth: number }> = [];

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      let taskCalls = 0;

      for (const e of events) {
        if (e.type !== "assistant") continue;
        const ae = e as AssistantEvent;
        const content = ae.message.content;
        if (!Array.isArray(content)) continue;
        for (const item of content as ContentItem[]) {
          if (item.type === "tool_use" && (item.name === "Task" || item.name === "dispatch_agent")) {
            taskCalls++;
          }
        }
      }

      if (taskCalls > 0) {
        items.push({ sessionId: s.id, taskCalls, breadth: taskCalls });
      }
    }

    items.sort((a, b) => b.taskCalls - a.taskCalls);
    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};

registerTool(subagentFanoutTool);
