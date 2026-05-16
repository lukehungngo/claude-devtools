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

const LOOKBACK = 10; // How many events back to check for a Read

export const editToReadRatioTool: ToolDefinition = {
  name: "edit_to_read_ratio",
  description:
    "Read-before-Edit hygiene ratio. Measures how often Edit/Write is preceded by a Read of the same file.",
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
    let totalEdits = 0;
    let editsPrecededByRead = 0;

    for (const s of sessions) {
      const events = parseJsonlFile(s.path);
      // Track recently Read file paths within a sliding window
      const recentReads: string[] = [];

      for (const e of events) {
        if (e.type !== "assistant") continue;
        const ae = e as AssistantEvent;
        const content = ae.message.content;
        if (!Array.isArray(content)) continue;

        for (const item of content as ContentItem[]) {
          if (item.type !== "tool_use") continue;
          const input = item.input as Record<string, unknown>;
          const filePath = (input.file_path as string) ?? "";

          if (item.name === "Read" && filePath) {
            recentReads.push(filePath);
            if (recentReads.length > LOOKBACK) recentReads.shift();
          } else if ((item.name === "Edit" || item.name === "Write") && filePath) {
            totalEdits++;
            if (recentReads.includes(filePath)) {
              editsPrecededByRead++;
            }
          }
        }
      }
    }

    const ratio = totalEdits > 0 ? editsPrecededByRead / totalEdits : 1;
    return scrubSecrets(
      capPayload({ totalEdits, editsPrecededByRead, ratio }, cfg.payloadCapBytes),
    );
  },
};

registerTool(editToReadRatioTool);
