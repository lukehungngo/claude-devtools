import { openSync, readSync, closeSync, statSync, existsSync, readdirSync, type Stats } from "node:fs";
import { basename, join } from "node:path";
import type { SessionInfo } from "../types.js";
import { parserLog } from "../logger.js";

/**
 * Bytes to read from the head of a JSONL file for metadata extraction.
 * 4KB is enough for ~10 JSON lines at typical event sizes.
 */
const HEAD_BYTES = 4096;

/**
 * Tail scan reads chunks moving backward from EOF. Each chunk is 4 KB;
 * the scan stops when the caller signals completion (both `cwd` and
 * `gitBranch` found) or the cap is reached.
 *
 * Why a backward scan instead of "read last N bytes": empirical measurement
 * on ~500 real sessions showed ~10% contain a single JSONL event larger than
 * 4 KB. A fixed-window scan with partial-line discard wipes such sessions'
 * metadata entirely. The backward scan accumulates complete lines until a
 * hit or the cap — robust to arbitrary event sizes.
 */
const BACKWARD_SCAN_CHUNK = 4096;
/** Hard cap on bytes scanned by the backward tail scan. Protects against
 * degenerate files (e.g. a single multi-MB event with no extractable fields). */
const BACKWARD_SCAN_CAP = 256 * 1024;

/** Average bytes per JSONL event line — used for event count estimation. */
const AVG_BYTES_PER_EVENT = 500;

const ACTIVE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours
export const RUNNING_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes — kept for external callers (session-routes, discovery-routes)

/**
 * Bytes to read from the tail of the file when scanning for terminal signals.
 * 2 KB is enough for ~20 JSONL event lines at typical sizes.
 */
const TERMINAL_SCAN_BYTES = 2048;

/**
 * If a session file was modified within this window AND has no terminal signal,
 * we consider it actively running.
 */
const ACTIVE_WRITE_WINDOW_MS = 30_000; // 30 seconds

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
 * For metadata extraction, reads only the first HEAD_BYTES of each file,
 * then runs a bounded backward line-scan from EOF until `cwd` and
 * `gitBranch` are found (or the BACKWARD_SCAN_CAP is reached) — never
 * the entire contents.
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
      // Recalculate isActive — it depends on current time relative to last write.
      // isRunning is NOT recalculated here: it was determined from JSONL terminal
      // signals when the file was parsed and is stable until the file changes.
      const ageMs = Date.now() - stat.mtime.getTime();
      cached.info.isActive = ageMs < ACTIVE_THRESHOLD_MS;
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

    // Read head bytes for metadata extraction
    const headLines = this.readHeadLines(filePath, stat.size);

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

    // Backward tail scan (most recent first) for fields where we prefer the
    // most recent value (gitBranch) and for fallback fields (sessionName, model,
    // cwd) that may be absent from the head slice.
    // We always walk the tail (not gated on missing fields) so that gitBranch
    // reflects the session's current branch, not whatever it was at session start.
    let tailGitBranch: string | undefined;
    if (stat.size > HEAD_BYTES) {
      this.scanBackwardLines(filePath, stat.size, (line) => {
        try {
          const evt = JSON.parse(line);
          if (!tailGitBranch && evt.gitBranch) {
            tailGitBranch = evt.gitBranch;
          }
          if (!sessionName && evt.type === "custom-title" && evt.customTitle) {
            sessionName = evt.customTitle;
          }
          if (!model && evt.message?.model) {
            model = evt.message.model;
          }
          if (!cwd && evt.cwd) {
            cwd = evt.cwd;
          }
        } catch {
          // skip malformed lines (fail-safe parsing — invariant #3)
        }
        // Stop as soon as all target fields are satisfied. `gitBranch` is the
        // load-bearing field for the Honeywell-style bug; `cwd` is the load-
        // bearing field for repo grouping. `sessionName` and `model` are
        // best-effort — the cap will end the scan if they never appear.
        return Boolean(tailGitBranch && cwd && sessionName && model);
      });
    }
    // Tail (most-recent) branch wins over head (session-start) branch.
    if (tailGitBranch) gitBranch = tailGitBranch;

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
    const hasTerminalSignal = this.hasTerminalSignal(filePath, stat.size);

    // Derive isRunning from JSONL content, not mtime:
    //   - Terminal signal found → session ended definitively.
    //   - No terminal signal + file written within 30s → actively being written.
    //   - No terminal signal + stale file → session abandoned without end signal.
    const isRunning = hasTerminalSignal
      ? false
      : ageMs < ACTIVE_WRITE_WINDOW_MS;

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
      isRunning,
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
   * Scan JSONL lines from the end of a file, moving backward in
   * `BACKWARD_SCAN_CHUNK`-sized chunks. Accumulates bytes into a buffer and
   * yields complete lines right-to-left to `onLine`. Stops when `onLine`
   * returns `true`, when `BACKWARD_SCAN_CAP` bytes have been read, or when
   * the file is fully consumed.
   *
   * Note: UTF-8 multi-byte sequences that straddle a chunk boundary may
   * produce replacement characters on the first line of a chunk. This is
   * acceptable because:
   *   1. We skip malformed JSON lines (invariant #3).
   *   2. The field we care about (gitBranch / cwd) almost always appears on
   *      multiple events; another line in the next chunk will carry it.
   */
  private scanBackwardLines(
    filePath: string,
    fileSize: number,
    onLine: (line: string) => boolean,
  ): void {
    if (fileSize === 0) return;

    let position = fileSize;
    let bytesScanned = 0;
    let buffer = "";
    const fd = openSync(filePath, "r");
    try {
      while (position > 0 && bytesScanned < BACKWARD_SCAN_CAP) {
        const chunkSize = Math.min(BACKWARD_SCAN_CHUNK, position);
        position -= chunkSize;
        bytesScanned += chunkSize;

        const chunk = Buffer.alloc(chunkSize);
        readSync(fd, chunk, 0, chunkSize, position);
        buffer = chunk.toString("utf-8") + buffer;

        // Split into lines. If we're not yet at the start of the file,
        // the first element of `parts` is a partial line — keep it in the
        // buffer to be completed by the next (earlier) chunk.
        const parts = buffer.split("\n");
        buffer = position > 0 ? parts.shift() ?? "" : "";

        // Iterate newest-first (end of array = closest to EOF in this chunk).
        for (let i = parts.length - 1; i >= 0; i--) {
          const line = parts[i].trim();
          if (!line) continue;
          if (onLine(line)) return;
        }
      }

      // Handle any leftover buffered line when we've reached the start of
      // the file (position === 0 caused the final iteration to clear buffer,
      // but if we exited via the cap then buffer may still hold a partial
      // line — ignore it to preserve line integrity).
    } catch (err) {
      parserLog.warn({ filePath, error: String(err) }, "SessionCache: failed to backward-scan tail");
    } finally {
      closeSync(fd);
    }
  }

  /**
   * Read the last TERMINAL_SCAN_BYTES of the file and check whether any
   * parsed JSONL line contains a terminal signal:
   *   - type === "assistant" AND message.stop_reason === "end_turn"
   *   - type === "system"    AND subtype === "turn_duration"
   *
   * Uses a single openSync/readSync call (cheap tail read) — never re-reads
   * the full file. Consistent with architecture invariant #2.
   */
  private hasTerminalSignal(filePath: string, fileSize: number): boolean {
    if (fileSize === 0) return false;

    const readSize = Math.min(TERMINAL_SCAN_BYTES, fileSize);
    const offset = fileSize - readSize;
    const fd = openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(readSize);
      readSync(fd, buf, 0, readSize, offset);
      const text = buf.toString("utf-8");
      const lines = text.split("\n");

      // If we started mid-file, the first element may be a partial line — skip it.
      const startIdx = offset > 0 ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const evt = JSON.parse(line) as Record<string, unknown>;
          if (isTerminalEvent(evt)) return true;
        } catch {
          // skip malformed lines (invariant #3)
        }
      }
    } catch (err) {
      parserLog.warn({ filePath, error: String(err) }, "SessionCache: failed to read terminal scan");
    } finally {
      closeSync(fd);
    }
    return false;
  }
}

/**
 * Returns true if the event is a known terminal signal for a Claude session.
 */
function isTerminalEvent(evt: Record<string, unknown>): boolean {
  if (evt["type"] === "assistant") {
    const msg = evt["message"];
    if (msg && typeof msg === "object" && (msg as Record<string, unknown>)["stop_reason"] === "end_turn") {
      return true;
    }
  }
  if (evt["type"] === "system" && evt["subtype"] === "turn_duration") {
    return true;
  }
  return false;
}
