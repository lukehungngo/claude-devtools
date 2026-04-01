/**
 * LRU cache for session metrics keyed by filePath + size + mtime.
 * Avoids re-parsing and re-computing metrics for unchanged files.
 */
export class MetricsCache {
    entries = new Map();
    maxEntries;
    ttlMs;
    constructor(opts = { maxEntries: 50, ttlMs: 60_000 }) {
        this.maxEntries = opts.maxEntries;
        this.ttlMs = opts.ttlMs;
    }
    /**
     * Look up a cached value. Returns null on miss, stale key, or expired TTL.
     * Updates lastAccessed on hit for LRU tracking.
     */
    get(key) {
        const entry = this.entries.get(key.filePath);
        if (!entry)
            return null;
        // Validate key match (size + mtime must match)
        if (entry.key.size !== key.size || entry.key.mtimeMs !== key.mtimeMs) {
            this.entries.delete(key.filePath);
            return null;
        }
        // Check TTL
        if (Date.now() - entry.createdAt > this.ttlMs) {
            this.entries.delete(key.filePath);
            return null;
        }
        // Update LRU access time
        entry.lastAccessed = Date.now();
        return entry.value;
    }
    /**
     * Store a value in the cache. Evicts LRU entry if at capacity.
     */
    set(key, value) {
        // If updating existing entry for same filePath, just replace
        if (this.entries.has(key.filePath)) {
            this.entries.delete(key.filePath);
        }
        // Evict LRU if at capacity
        if (this.entries.size >= this.maxEntries) {
            this.evictLRU();
        }
        const now = Date.now();
        this.entries.set(key.filePath, {
            key,
            value,
            createdAt: now,
            lastAccessed: now,
        });
    }
    /** Number of cached entries. */
    get size() {
        return this.entries.size;
    }
    /** Remove all entries. */
    clear() {
        this.entries.clear();
    }
    /** Remove a specific entry by file path. */
    invalidate(filePath) {
        this.entries.delete(filePath);
    }
    evictLRU() {
        let oldestKey = null;
        let oldestAccess = Infinity;
        for (const [key, entry] of this.entries) {
            if (entry.lastAccessed < oldestAccess) {
                oldestAccess = entry.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.entries.delete(oldestKey);
        }
    }
}
//# sourceMappingURL=metrics-cache.js.map