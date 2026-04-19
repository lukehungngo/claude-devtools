import { statSync } from "node:fs";
import type {
  SessionInfo,
  InsightsModelMix,
  InsightsModelRow,
  InsightsTimeRange,
} from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { calculateTokenCost } from "./metrics.js";
import { getTimeRangeCutoff } from "./insights-aggregator.js";

interface ModelStats {
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
}

interface ModelMixSessionCache {
  fileSize: number;
  offset: number;
  models: Map<string, ModelStats>;
}

const modelMixSessionCache = new Map<string, ModelMixSessionCache>();

/** Exposed only for test isolation — clears module-level cache between tests. */
export function _resetModelMixCacheForTesting(): void {
  modelMixSessionCache.clear();
}

function computeModelMixForSession(session: SessionInfo): Map<string, ModelStats> {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return new Map();
  }

  const cached = modelMixSessionCache.get(session.id);
  if (cached && cached.fileSize === stat.size) return cached.models;

  const fromOffset = cached?.offset ?? 0;

  // Clone cached model stats so incremental additions don't mutate the cached copy
  const models: Map<string, ModelStats> = new Map(
    cached
      ? [...cached.models.entries()].map(([k, v]) => [k, { ...v }])
      : []
  );

  try {
    const { events, newOffset } = parseJsonlIncremental(session.path, fromOffset);

    for (const event of events) {
      if (event.type !== "assistant") continue;
      const model = event.message.model || "unknown";
      const usage = event.message.usage;
      if (!usage) continue;

      const inTok = (usage.input_tokens || 0)
        + (usage.cache_read_input_tokens || 0)
        + (usage.cache_creation_input_tokens || 0);
      const outTok = usage.output_tokens || 0;
      const cost = calculateTokenCost(model, {
        inputTokens: usage.input_tokens || 0,
        outputTokens: outTok,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      });

      const existing: ModelStats = models.get(model) ?? {
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        turns: 0,
      };

      models.set(model, {
        tokensIn: existing.tokensIn + inTok,
        tokensOut: existing.tokensOut + outTok,
        cost: existing.cost + cost,
        turns: existing.turns + 1,
      });
    }

    modelMixSessionCache.set(session.id, {
      fileSize: stat.size,
      offset: newOffset,
      models,
    });

    return models;
  } catch {
    // Fail-safe: return whatever we accumulated before the error
    return models;
  }
}

export function computeInsightsModelMix(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string
): InsightsModelMix {
  const fromMs = getTimeRangeCutoff(timeRange);

  const filtered = sessions.filter((s) => {
    const t = new Date(s.lastModified).getTime();
    if (fromMs > 0 && t < fromMs) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  const totals = new Map<string, ModelStats>();

  for (const session of filtered) {
    const sessionModels = computeModelMixForSession(session);

    for (const [model, stats] of sessionModels) {
      const existing: ModelStats = totals.get(model) ?? {
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        turns: 0,
      };

      totals.set(model, {
        tokensIn: existing.tokensIn + stats.tokensIn,
        tokensOut: existing.tokensOut + stats.tokensOut,
        cost: existing.cost + stats.cost,
        turns: existing.turns + stats.turns,
      });
    }
  }

  const totalTokens = [...totals.values()].reduce(
    (sum, v) => sum + v.tokensIn + v.tokensOut,
    0
  );

  const models: InsightsModelRow[] = [...totals.entries()]
    .map(([model, stats]): InsightsModelRow => ({
      model,
      tokensIn: stats.tokensIn,
      tokensOut: stats.tokensOut,
      cost: stats.cost,
      turns: stats.turns,
      share: totalTokens > 0 ? (stats.tokensIn + stats.tokensOut) / totalTokens : 0,
    }))
    .sort((a, b) => (b.tokensIn + b.tokensOut) - (a.tokensIn + a.tokensOut));

  return { models, totalTokens };
}
