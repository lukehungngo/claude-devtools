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

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export const unfinishedSessionsTool: ToolDefinition = {
  name: "unfinished_sessions",
  description: "Sessions with no end_turn stop_reason and stale > 30 minutes.",
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
    const now = Date.now();
    const items: Array<{
      id: string;
      projectHash: string;
      lastEventAt: string;
      staleSinceMs: number;
    }> = [];

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      const hasEndTurn = events.some(
        (e) =>
          e.type === "assistant" &&
          (e as AssistantEvent).message.stop_reason === "end_turn",
      );
      if (hasEndTurn) continue;

      const lastEvent = events[events.length - 1];
      if (!lastEvent) continue;
      const lastMs = new Date(lastEvent.timestamp).getTime();
      const staleSinceMs = now - lastMs;

      if (staleSinceMs > STALE_THRESHOLD_MS) {
        items.push({
          id: s.id,
          projectHash: s.projectHash,
          lastEventAt: lastEvent.timestamp,
          staleSinceMs,
        });
      }
    }

    items.sort((a, b) => b.staleSinceMs - a.staleSinceMs);
    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};

registerTool(unfinishedSessionsTool);
