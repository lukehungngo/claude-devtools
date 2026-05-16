import { z } from "zod";
import { RangeSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";

const Input = z.object({
  query: z.string().min(1).max(500),
  range: RangeSchema,
});

export const searchSessionsTool: ToolDefinition = {
  name: "search_sessions",
  description:
    "Find sessions whose event text matches a query (case-insensitive substring).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      range: { type: "string", enum: ["24h", "7d", "30d", "90d", "all"] },
    },
    required: ["query", "range"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const q = parsed.data.query.toLowerCase();
    const sessions = listSessions({ range: parsed.data.range });
    const hits: Array<{ id: string; lastModified: string; matchCount: number }> = [];
    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      let n = 0;
      for (const e of events) {
        if (JSON.stringify(e).toLowerCase().includes(q)) n++;
      }
      if (n > 0) hits.push({ id: s.id, lastModified: s.lastModified, matchCount: n });
    }
    hits.sort((a, b) => b.matchCount - a.matchCount);
    return scrubSecrets(capPayload({ items: hits }, cfg.payloadCapBytes));
  },
};

registerTool(searchSessionsTool);
