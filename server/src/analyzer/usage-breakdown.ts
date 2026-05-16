import { statSync } from "node:fs";
import type { SessionEvent, SessionInfo } from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { calculateTokenCost } from "./metrics.js";

/**
 * Per-model usage row exposed to the dashboard.
 *
 * `cacheHitRatio` denominator follows `metrics.ts` semantics:
 *   input_tokens + cache_read_input_tokens + cache_creation_input_tokens
 *
 * `input_tokens` already excludes cache reads in the Anthropic API contract,
 * so the three categories sum to the total input context for the request.
 */
export interface PerModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** cache_read / (input + cache_read + cache_create); 0 if denominator is 0. */
  cacheHitRatio: number;
  totalCost: number;
}

export interface UsageBreakdown {
  perModel: PerModelUsage[];
  totalCost: number;
}

interface ModelBucket {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

interface SessionBucket {
  fileSize: number;
  offset: number;
  byModel: Map<string, ModelBucket>;
}

// Stat-based incremental cache, mirroring cost-aggregator.ts (Invariant #2).
const sessionCache = new Map<string, SessionBucket>();

function emptyBucket(): ModelBucket {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0,
  };
}

function computeSessionBuckets(session: SessionInfo): SessionBucket | null {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return null;
  }

  const cached = sessionCache.get(session.id);
  if (cached && cached.fileSize === stat.size) {
    return cached;
  }

  const fromOffset = cached ? cached.offset : 0;
  const byModel = cached
    ? new Map(
        Array.from(cached.byModel.entries()).map(([k, v]) => [k, { ...v }])
      )
    : new Map<string, ModelBucket>();

  try {
    const { events, newOffset } = parseJsonlIncremental(
      session.path,
      fromOffset
    );

    for (const event of events) {
      if (event.type !== "assistant") continue;
      const usage = event.message.usage;
      if (!usage) continue;
      const model = event.message.model || "unknown";
      // Skip synthetic events — they pollute model lists with zero-token rows.
      if (model.startsWith("<")) continue;

      const input = usage.input_tokens || 0;
      const output = usage.output_tokens || 0;
      const cacheCreate = usage.cache_creation_input_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;

      const cost = calculateTokenCost(model, {
        inputTokens: input,
        outputTokens: output,
        cacheWriteTokens: cacheCreate,
        cacheReadTokens: cacheRead,
      });

      let bucket = byModel.get(model);
      if (!bucket) {
        bucket = emptyBucket();
        byModel.set(model, bucket);
      }
      bucket.inputTokens += input;
      bucket.outputTokens += output;
      bucket.cacheCreationTokens += cacheCreate;
      bucket.cacheReadTokens += cacheRead;
      bucket.totalCost += cost;
    }

    const next: SessionBucket = {
      fileSize: stat.size,
      offset: newOffset,
      byModel,
    };
    sessionCache.set(session.id, next);
    return next;
  } catch {
    return null;
  }
}

export function aggregatePerModelUsage(
  sessions: SessionInfo[]
): UsageBreakdown {
  const merged = new Map<string, ModelBucket>();

  for (const session of sessions) {
    const data = computeSessionBuckets(session);
    if (!data) continue;
    for (const [model, bucket] of data.byModel.entries()) {
      let acc = merged.get(model);
      if (!acc) {
        acc = emptyBucket();
        merged.set(model, acc);
      }
      acc.inputTokens += bucket.inputTokens;
      acc.outputTokens += bucket.outputTokens;
      acc.cacheCreationTokens += bucket.cacheCreationTokens;
      acc.cacheReadTokens += bucket.cacheReadTokens;
      acc.totalCost += bucket.totalCost;
    }
  }

  const perModel: PerModelUsage[] = Array.from(merged.entries()).map(
    ([model, b]) => {
      const denom = b.inputTokens + b.cacheReadTokens + b.cacheCreationTokens;
      const cacheHitRatio = denom > 0 ? b.cacheReadTokens / denom : 0;
      return {
        model,
        inputTokens: b.inputTokens,
        outputTokens: b.outputTokens,
        cacheCreationTokens: b.cacheCreationTokens,
        cacheReadTokens: b.cacheReadTokens,
        cacheHitRatio,
        totalCost: b.totalCost,
      };
    }
  );

  // Sort descending by total tokens so the heaviest model is first.
  perModel.sort((a, b) => {
    const ta =
      a.inputTokens + a.outputTokens + a.cacheCreationTokens + a.cacheReadTokens;
    const tb =
      b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens;
    return tb - ta;
  });

  const totalCost = perModel.reduce((sum, row) => sum + row.totalCost, 0);
  return { perModel, totalCost };
}

/**
 * Aggregate per-model usage from an already-parsed event slice (e.g. one
 * turn's events). Bug H — Usage tab turn scoping. Mirrors the per-assistant-
 * event accumulation in `computeSessionBuckets` but operates on the event
 * array directly, with no file I/O and no cache (a single turn is cheap to
 * recompute and is dominated by the JSONL load that happens once per
 * request).
 *
 * Same semantics as `aggregatePerModelUsage`:
 *   - skip non-assistant events
 *   - skip events without `usage`
 *   - skip synthetic models (those whose name starts with "<")
 *   - cacheHitRatio = cache_read / (input + cache_read + cache_create)
 *   - rows sorted descending by total tokens
 */
export function aggregateEventsPerModel(
  events: SessionEvent[],
): UsageBreakdown {
  const byModel = new Map<string, ModelBucket>();

  for (const event of events) {
    if (event.type !== "assistant") continue;
    const usage = event.message.usage;
    if (!usage) continue;
    const model = event.message.model || "unknown";
    if (model.startsWith("<")) continue;

    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheCreate = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;

    const cost = calculateTokenCost(model, {
      inputTokens: input,
      outputTokens: output,
      cacheWriteTokens: cacheCreate,
      cacheReadTokens: cacheRead,
    });

    let bucket = byModel.get(model);
    if (!bucket) {
      bucket = emptyBucket();
      byModel.set(model, bucket);
    }
    bucket.inputTokens += input;
    bucket.outputTokens += output;
    bucket.cacheCreationTokens += cacheCreate;
    bucket.cacheReadTokens += cacheRead;
    bucket.totalCost += cost;
  }

  const perModel: PerModelUsage[] = Array.from(byModel.entries()).map(
    ([model, b]) => {
      const denom = b.inputTokens + b.cacheReadTokens + b.cacheCreationTokens;
      const cacheHitRatio = denom > 0 ? b.cacheReadTokens / denom : 0;
      return {
        model,
        inputTokens: b.inputTokens,
        outputTokens: b.outputTokens,
        cacheCreationTokens: b.cacheCreationTokens,
        cacheReadTokens: b.cacheReadTokens,
        cacheHitRatio,
        totalCost: b.totalCost,
      };
    },
  );

  perModel.sort((a, b) => {
    const ta =
      a.inputTokens + a.outputTokens + a.cacheCreationTokens + a.cacheReadTokens;
    const tb =
      b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens;
    return tb - ta;
  });

  const totalCost = perModel.reduce((sum, row) => sum + row.totalCost, 0);
  return { perModel, totalCost };
}
