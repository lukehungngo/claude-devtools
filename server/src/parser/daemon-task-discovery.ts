import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parserLog } from "../logger.js";

/**
 * One CC daemon task record, sourced from
 * `~/.claude/tasks/<sessionId>/<id>.json`. Schema verified against CC 2.1.143.
 *
 * The daemon writes one JSON file per task and updates it in place as the
 * task progresses. This module reads them on demand (no cache) so the
 * dashboard sees status flips (`pending` → `in_progress` → `completed`)
 * without server restart — task counts per session are small (~20).
 */
export interface DaemonTaskRecord {
  id: string;
  subject: string;
  description?: string;
  activeForm?: string;
  /** Daemon-emitted statuses include "pending" | "in_progress" | "completed" | "deleted". */
  status: string;
  /** Task IDs this task blocks. */
  blocks: string[];
  /** Task IDs blocking this task. */
  blockedBy: string[];
}

/** Resolves the on-disk root directory holding per-session task subdirs. */
function getDaemonTasksRoot(): string {
  return join(homedir(), ".claude", "tasks");
}

/**
 * Coerce an unknown value to `string[]`. Accepts arrays of strings; everything
 * else (missing, null, non-array, mixed types) falls back to []. The daemon
 * always writes well-formed arrays — this is fail-safe parsing.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

/**
 * Parse one task JSON file. Returns `null` when the file is unreadable,
 * contains malformed JSON, or lacks the required `id`/`subject`/`status`
 * fields. Errors are logged at warn level and swallowed (invariant #3 —
 * fail-safe parsing).
 */
function parseTaskFile(filePath: string): DaemonTaskRecord | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const idVal = parsed["id"];
    const subjectVal = parsed["subject"];
    const statusVal = parsed["status"];

    if (
      typeof idVal !== "string" ||
      typeof subjectVal !== "string" ||
      typeof statusVal !== "string"
    ) {
      parserLog.warn(
        { filePath },
        "daemon-task-discovery: missing required field, skipping",
      );
      return null;
    }

    const record: DaemonTaskRecord = {
      id: idVal,
      subject: subjectVal,
      status: statusVal,
      blocks: toStringArray(parsed["blocks"]),
      blockedBy: toStringArray(parsed["blockedBy"]),
    };

    if (typeof parsed["description"] === "string") {
      record.description = parsed["description"];
    }
    if (typeof parsed["activeForm"] === "string") {
      record.activeForm = parsed["activeForm"];
    }

    return record;
  } catch (err) {
    parserLog.warn(
      { filePath, error: String(err) },
      "daemon-task-discovery: failed to parse task file",
    );
    return null;
  }
}

/**
 * Compare two task IDs numerically when both parse to integers; otherwise
 * fall back to lexicographic. Real daemon IDs are `"1"`, `"2"`, …, `"10"` —
 * we want `"10"` after `"2"`, not before it.
 */
function compareTaskIds(a: string, b: string): number {
  const an = Number.parseInt(a, 10);
  const bn = Number.parseInt(b, 10);
  const aNum = Number.isFinite(an) && String(an) === a;
  const bNum = Number.isFinite(bn) && String(bn) === b;
  if (aNum && bNum) return an - bn;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Discover every task record for a session under
 * `~/.claude/tasks/<sessionId>/`. Malformed and unreadable files are skipped.
 * Returns an empty array when the session has no tasks directory.
 *
 * Results are sorted by numeric id ascending.
 */
export function loadDaemonTasks(
  sessionId: string,
  options?: { dir?: string },
): DaemonTaskRecord[] {
  const root = options?.dir ?? getDaemonTasksRoot();
  const sessionDir = join(root, sessionId);
  if (!existsSync(sessionDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch (err) {
    parserLog.warn(
      { sessionDir, error: String(err) },
      "daemon-task-discovery: failed to read session tasks dir",
    );
    return [];
  }

  const records: DaemonTaskRecord[] = [];
  for (const entry of entries) {
    // Skip dotfiles (.lock, .highwatermark) and non-JSON files. The
    // `endsWith(".json")` check already rejects dotfiles in practice; we
    // keep the startsWith(".") guard for clarity.
    if (entry.startsWith(".")) continue;
    if (!entry.endsWith(".json")) continue;
    const record = parseTaskFile(join(sessionDir, entry));
    if (record) records.push(record);
  }

  records.sort((a, b) => compareTaskIds(a.id, b.id));
  return records;
}
