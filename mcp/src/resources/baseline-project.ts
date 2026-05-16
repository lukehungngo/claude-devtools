import { registerResource, type ResourceDefinition } from "./registry.js";
import { listSessions } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { calculateTokenCost } from "claude-devtools-server/src/analyzer/metrics.js";
import type { AssistantEvent } from "claude-devtools-server/src/types.js";

interface BaselineCache {
  computedAt: number;
  signature: string;
  value: unknown;
}

const cache = new Map<string, BaselineCache>();

export const baselineProject: ResourceDefinition = {
  uri: "baseline://project/{name}",
  name: "Project 30d baseline",
  mimeType: "application/json",
  description: "Rolling 30-day baseline metrics for a project (computed on-demand, cached).",
  read: async (uri: string) => {
    const name = uri.replace("baseline://project/", "");
    if (!name) throw new Error("Missing project name in URI");

    const sessions = listSessions({ range: "30d", project: name });
    const signature = sessions.map((s) => `${s.id}:${s.lastModified}`).join("|");

    const hit = cache.get(name);
    if (hit && hit.signature === signature) {
      return {
        contents: [
          { uri, mimeType: "application/json", text: JSON.stringify(hit.value) },
        ],
      };
    }

    let totalCost = 0;
    let totalTokens = 0;
    let totalErrors = 0;
    let totalCalls = 0;

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
          totalTokens += inTok + outTok;
          totalCost += calculateTokenCost(model, {
            inputTokens: inTok,
            outputTokens: outTok,
            cacheWriteTokens: usage.cache_creation_input_tokens || 0,
            cacheReadTokens: usage.cache_read_input_tokens || 0,
          });
        } else if (e.type === "user") {
          const content = e.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (typeof item === "object" && item !== null && (item as { type?: string }).type === "tool_result") {
                totalCalls++;
                if ((item as { is_error?: boolean }).is_error) totalErrors++;
              }
            }
          }
        }
      }
    }

    const value = {
      project: name,
      sessions: sessions.length,
      totalCost,
      totalTokens,
      avgCostPerSession: sessions.length > 0 ? totalCost / sessions.length : 0,
      errorRate: totalCalls > 0 ? totalErrors / totalCalls : 0,
    };

    cache.set(name, { computedAt: Date.now(), signature, value });
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }],
    };
  },
};

registerResource(baselineProject);
