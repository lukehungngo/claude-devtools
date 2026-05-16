import { z } from "zod";
import { RangeSchema, LimitSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";

const Input = z.object({
  range: RangeSchema,
  limit: LimitSchema,
});

export const longestSessionsTool: ToolDefinition = {
  name: "longest_sessions",
  description: "Top N sessions by duration (last event time - first event time).",
  inputSchema: {
    type: "object",
    properties: {
      range: { type: "string", enum: ["24h", "7d", "30d", "90d", "all"] },
      limit: { type: "number", default: 10 },
    },
    required: ["range"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const sessions = listSessions({ range: parsed.data.range });

    const withDuration = sessions.map((s) => {
      const events = parseJsonlFile(s.path);
      const first = events[0]?.timestamp;
      const last = events[events.length - 1]?.timestamp;
      const durationMs =
        first && last
          ? new Date(last).getTime() - new Date(first).getTime()
          : 0;
      return { id: s.id, projectHash: s.projectHash, durationMs, eventCount: events.length };
    });

    withDuration.sort((a, b) => b.durationMs - a.durationMs);
    const items = withDuration.slice(0, parsed.data.limit);

    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};

registerTool(longestSessionsTool);
