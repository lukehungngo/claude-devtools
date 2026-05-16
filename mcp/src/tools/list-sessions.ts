import { z } from "zod";
import { LimitSchema, ProjectSchema, RangeSchema } from "./schemas.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { loadConfig } from "../config.js";
import { registerTool, type ToolDefinition } from "./registry.js";

const Input = z.object({
  range: RangeSchema,
  project: ProjectSchema,
  limit: LimitSchema,
});

export const listSessionsTool: ToolDefinition = {
  name: "list_sessions",
  description:
    "List Claude Code sessions within a time range, optionally filtered by project.",
  inputSchema: {
    type: "object",
    properties: {
      range: { type: "string", enum: ["24h", "7d", "30d", "90d", "all"] },
      project: { type: "string" },
      limit: { type: "number", default: 50 },
    },
    required: ["range"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const sessions = listSessions(parsed.data);
    const items = sessions.map((s) => ({
      id: s.id,
      projectHash: s.projectHash,
      lastModified: s.lastModified,
      eventCount: s.eventCount,
      sizeBytes: s.sizeBytes,
    }));
    const cfg = loadConfig();
    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};

registerTool(listSessionsTool);
