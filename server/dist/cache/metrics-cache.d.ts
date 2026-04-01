import type { SessionMetrics, SessionEvent } from "../types.js";
export interface MetricsCacheKey {
    filePath: string;
    size: number;
    mtimeMs: number;
}
export interface MetricsCacheValue {
    metrics: SessionMetrics;
    events: SessionEvent[];
    subagentMeta: Map<string, {
        agentType: string;
        description: string;
    }>;
}
/**
 * LRU cache for session metrics keyed by filePath + size + mtime.
 * Avoids re-parsing and re-computing metrics for unchanged files.
 */
export declare class MetricsCache {
    private entries;
    private readonly maxEntries;
    private readonly ttlMs;
    constructor(opts?: {
        maxEntries: number;
        ttlMs: number;
    });
    /**
     * Look up a cached value. Returns null on miss, stale key, or expired TTL.
     * Updates lastAccessed on hit for LRU tracking.
     */
    get(key: MetricsCacheKey): MetricsCacheValue | null;
    /**
     * Store a value in the cache. Evicts LRU entry if at capacity.
     */
    set(key: MetricsCacheKey, value: MetricsCacheValue): void;
    /** Number of cached entries. */
    get size(): number;
    /** Remove all entries. */
    clear(): void;
    /** Remove a specific entry by file path. */
    invalidate(filePath: string): void;
    private evictLRU;
}
