import { z } from "zod";
import { SessionIdSchema } from "./schemas.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { loadSessionMetrics } from "../adapter/metrics-adapter.js";
import { findSessionPath } from "../security/path-guard.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { registerTool, type ToolDefinition } from "./registry.js";

const Include = z.enum(["events", "metrics"]);
const Input = z.object({
  id: SessionIdSchema,
  include: z.array(Include).min(1).default(["metrics"]),
});

export const getSessionTool: ToolDefinition = {
  name: "get_session",
  description: "Return events and/or metrics for a single session.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      include: { type: "array", items: { enum: ["events", "metrics"] } },
    },
    required: ["id"],
  },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const filePath = findSessionPath(cfg.projectsDir, parsed.data.id);

    const out: Record<string, unknown> = { id: parsed.data.id };
    if (parsed.data.include.includes("events")) {
      out.events = parseJsonlFile(filePath);
    }
    if (parsed.data.include.includes("metrics")) {
      out.metrics = loadSessionMetrics(parsed.data.id);
    }
    return scrubSecrets(capPayload(out, cfg.payloadCapBytes));
  },
};

registerTool(getSessionTool);
