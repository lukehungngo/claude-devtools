import { openSync, readSync, closeSync, statSync, existsSync, readdirSync, type Stats } from "node:fs";
import { basename, join } from "node:path";
import type { SessionInfo } from "../types.js";
import { parserLog } from "../logger.js";

/**
 * Bytes to read from the head/tail of a JSONL file for metadata extraction.
 * 4KB is enough for ~10 JSON lines at typical event sizes.
 */
const HEAD_BYTES = 4096;
const TAIL_BYTES = 4096;

/** Average bytes per JSONL event line — used for event count estimation. */
const AVG_BYTES_PER_EVENT = 500;

const ACTIVE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours
const RUNNING_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

interface CacheEntry {
  info: SessionInfo;
  size: number;
  mtimeMs: number;
}

/**
 * In-memory cache for SessionInfo metadata extracted from JSONL files.
 * Uses file stat (size + mtime) for invalidation — avoids re-reading
 * unchanged files on every request.
 *
 * For metadata extraction, reads only the first 4KB and last 4KB
 * of each file instead of the entire contents.
 */
export class SessionCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Get SessionInfo for a JSONL file, using cached data if the file
   * has not changed (same size and mtime).
   */
  getSessionInfo(filePath: string, projectHash: string): SessionInfo | null {
    if (!existsSync(filePath)) return null;

    const stat = statSync(filePath);
    const cached = this.cache.get(filePath);

    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      // Recalculate volatile fields (isActive, isRunning depend on current time)
      const ageMs = Date.now() - stat.mtime.getTime();
      cached.info.isActive = ageMs < ACTIVE_THRESHOLD_MS;
      cached.info.isRunning = ageMs < RUNNING_THRESHOLD_MS;
      return cached.info;
    }

    // Cache miss or invalidated — read head/tail of file
    const info = this.extractSessionInfo(filePath, projectHash, stat);
    this.cache.set(filePath, {
      info,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
    return info;
  }

  /** Remove a specific file from the cache. */
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  /** Clear all cached entries. */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private extractSessionInfo(
    filePath: string,
    projectHash: string,
    stat: Stats
  ): SessionInfo {
    const sessionId = basename(filePath, ".jsonl");

    // Estimate event count from file size
    const eventCount = stat.size > 0 ? Math.max(1, Math.round(stat.size / AVG_BYTES_PER_EVENT)) : 0;

    // Read head and tail bytes for metadata extraction
    const headLines = this.readHeadLines(filePath, stat.size);
    const tailLines = stat.size > HEAD_BYTES
      ? this.readTailLines(filePath, stat.size)
      : [];

    // Extract metadata from head (first ~10 lines)
    let startTime = stat.birthtime.toISOString();
    let cwd: string | undefined;
    let gitBranch: string | undefined;
    let permissionMode: string | undefined;
    let model: string | undefined;
    let sessionName: string | undefined;
    let slug: string | undefined;

    for (let i = 0; i < Math.min(headLines.length, 10); i++) {
      try {
        const evt = JSON.parse(headLines[i]);
        if (i === 0 && evt.timestamp) startTime = evt.timestamp;
        if (evt.cwd && !cwd) cwd = evt.cwd;
        if (evt.gitBranch && !gitBranch) gitBranch = evt.gitBranch;
        if (evt.permissionMode && !permissionMode) permissionMode = evt.permissionMode;
        if (evt.message?.model && !model) model = evt.message.model;
        if (evt.type === "custom-title" && evt.customTitle) sessionName = evt.customTitle;
        if (evt.slug && !slug) slug = evt.slug;
      } catch {
        // skip malformed lines
      }
    }

    // Scan tail for custom-title and model
    if (!sessionName || !model) {
      for (let i = tailLines.length - 1; i >= 0; i--) {
        try {
          const evt = JSON.parse(tailLines[i]);
          if (!sessionName && evt.type === "custom-title" && evt.customTitle) {
            sessionName = evt.customTitle;
          }
          if (!model && evt.message?.model) {
            model = evt.message.model;
          }
          if (sessionName && model) break;
        } catch {
          // skip
        }
      }
    }

    // Fallback: use slug as session name
    if (!sessionName && slug) sessionName = slug;

    // Count subagents
    const subagentDir = join(
      filePath.replace(`/${sessionId}.jsonl`, ""),
      sessionId,
      "subagents"
    );
    let subagentCount = 0;
    if (existsSync(subagentDir)) {
      subagentCount = readdirSync(subagentDir).filter((f) =>
        f.endsWith(".jsonl")
      ).length;
    }

    const ageMs = Date.now() - stat.mtime.getTime();

    return {
      id: sessionId,
      projectHash,
      path: filePath,
      startTime,
      lastModified: stat.mtime.toISOString(),
      eventCount,
      subagentCount,
      cwd,
      gitBranch,
      permissionMode,
      model,
      isActive: ageMs < ACTIVE_THRESHOLD_MS,
      isRunning: ageMs < RUNNING_THRESHOLD_MS,
      sessionName,
    };
  }

  /**
   * Read the first HEAD_BYTES of a file and split into lines.
   * Uses openSync/readSync to avoid reading the entire file.
   */
  private readHeadLines(filePath: string, fileSize: number): string[] {
    if (fileSize === 0) return [];

    const bytesToRead = Math.min(HEAD_BYTES, fileSize);
    const fd = openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(bytesToRead);
      readSync(fd, buf, 0, bytesToRead, 0);
      const text = buf.toString("utf-8");
      return text.split("\n").filter((l) => l.trim());
    } catch (err) {
      parserLog.warn({ filePath, error: String(err) }, "SessionCache: failed to read head");
      return [];
    } finally {
      closeSync(fd);
    }
  }

  /**
   * Read the last TAIL_BYTES of a file and split into lines.
   * Discards the first (potentially partial) line.
   */
  private readTailLines(filePath: string, fileSize: number): string[] {
    if (fileSize === 0) return [];

    const bytesToRead = Math.min(TAIL_BYTES, fileSize);
    const offset = fileSize - bytesToRead;
    const fd = openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(bytesToRead);
      readSync(fd, buf, 0, bytesToRead, offset);
      const text = buf.toString("utf-8");
      const lines = text.split("\n").filter((l) => l.trim());
      // If we're reading from a non-zero offset, the first line is likely partial
      if (offset > 0 && lines.length > 0) {
        lines.shift();
      }
      return lines;
    } catch (err) {
      parserLog.warn({ filePath, error: String(err) }, "SessionCache: failed to read tail");
      return [];
    } finally {
      closeSync(fd);
    }
  }
}
