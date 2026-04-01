import type { SessionInfo } from "../types.js";
/**
 * In-memory cache for SessionInfo metadata extracted from JSONL files.
 * Uses file stat (size + mtime) for invalidation — avoids re-reading
 * unchanged files on every request.
 *
 * For metadata extraction, reads only the first 4KB and last 4KB
 * of each file instead of the entire contents.
 */
export declare class SessionCache {
    private cache;
    /**
     * Get SessionInfo for a JSONL file, using cached data if the file
     * has not changed (same size and mtime).
     */
    getSessionInfo(filePath: string, projectHash: string): SessionInfo | null;
    /** Remove a specific file from the cache. */
    invalidate(filePath: string): void;
    /** Clear all cached entries. */
    clear(): void;
    get size(): number;
    private extractSessionInfo;
    /**
     * Read the first HEAD_BYTES of a file and split into lines.
     * Uses openSync/readSync to avoid reading the entire file.
     */
    private readHeadLines;
    /**
     * Read the last TAIL_BYTES of a file and split into lines.
     * Discards the first (potentially partial) line.
     */
    private readTailLines;
}
