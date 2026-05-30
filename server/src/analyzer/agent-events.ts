import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import type { SessionInfo, AgentLogEntry, SessionEvent, ContentItem } from "../types.js";
import { parseJsonlFile } from "../parser/jsonl-reader.js";
import { getClaudeProjectsDir } from "../parser/session-discovery.js";
import { normalizeContent } from "../lib/normalizeContent.js";

function getContentPreview(content: ContentItem[]): string {
  for (const item of content) {
    if (item.type === "text") {
      return item.text.slice(0, 120).replace(/\n/g, " ");
    }
    if (item.type === "tool_use") {
      return `[${item.name}] ${JSON.stringify(item.input).slice(0, 80)}`;
    }
    if (item.type === "tool_result") {
      const prefix = item.is_error ? "[ERROR] " : "";
      const raw = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
      return `${prefix}${raw.slice(0, 100).replace(/\n/g, " ")}`;
    }
    if (item.type === "thinking") {
      return `[thinking] ${item.thinking.slice(0, 100).replace(/\n/g, " ")}`;
    }
  }
  return "";
}

/**
 * Full, untruncated content for the live log view (newlines preserved). Unlike
 * getContentPreview, this returns ALL content items joined, with no slicing —
 * the Graph tab's log panel renders this so the user sees the complete output.
 */
function getFullContent(content: ContentItem[]): string {
  const parts: string[] = [];
  for (const item of content) {
    if (item.type === "text") {
      parts.push(item.text);
    } else if (item.type === "tool_use") {
      parts.push(`[${item.name}] ${JSON.stringify(item.input, null, 2)}`);
    } else if (item.type === "tool_result") {
      const prefix = item.is_error ? "[ERROR] " : "";
      const raw = typeof item.content === "string" ? item.content : JSON.stringify(item.content, null, 2);
      parts.push(`${prefix}${raw}`);
    } else if (item.type === "thinking") {
      parts.push(`[thinking] ${item.thinking}`);
    }
  }
  return parts.join("\n");
}

function eventToLogEntry(event: SessionEvent, agentId: string): AgentLogEntry {
  let contentPreview = "";
  let content = "";

  if (event.type === "user" || event.type === "assistant") {
    const items = normalizeContent(event.message.content);
    contentPreview = getContentPreview(items);
    content = getFullContent(items);
  } else if (event.type === "progress") {
    contentPreview = event.data?.type || "progress";
    content = contentPreview;
  } else if (event.type === "queue-operation") {
    contentPreview = `queue: ${event.operation}`;
    content = event.content ? `queue: ${event.operation} — ${event.content}` : contentPreview;
  }

  return {
    timestamp: event.timestamp,
    eventType: event.type,
    agentId,
    contentPreview,
    content,
    uuid: event.uuid,
  };
}

/**
 * Locate a subagent's `agent-<id>.jsonl` transcript.
 *
 * Subagents are NOT always flat under `subagents/` — workflow-dispatched agents
 * live at `subagents/workflows/<wf>/agent-<id>.jsonl`, and a session's files can
 * be scattered across multiple project-hash dirs when the cwd changes mid-session
 * (worktrees). So we recurse into `subagents/` across every project dir, mirroring
 * loadFullSession's discovery. A flat-only lookup returned an empty log for every
 * workflow/nested child node in the Graph. [2026-05-30]
 */
function findSubagentFile(sessionId: string, agentId: string): string | null {
  const root = getClaudeProjectsDir();
  if (!existsSync(root)) return null;

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }

  const target = `agent-${agentId}.jsonl`;
  for (const projectDir of projectDirs) {
    const base = join(root, projectDir, sessionId, "subagents");
    if (!existsSync(base)) continue;
    const stack: string[] = [base];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue; // unreadable dir — skip, never crash
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.name === target) {
          return full;
        }
      }
    }
  }
  return null;
}

/**
 * Stat-keyed cache of parsed log entries per transcript file. The Graph log
 * panel re-fetches `/events/:agentId` on every selection change and live tick;
 * without this, each hit re-parsed the full file (the main transcript can be
 * 17MB → ~50-60ms, violating the no-full-re-read invariant). A file whose
 * (mtime, size) is unchanged — every finished agent, and main between appends —
 * now returns instantly. Bounded to avoid unbounded growth across sessions.
 */
const MAX_CACHE_ENTRIES = 64;
const entryCache = new Map<string, { mtimeMs: number; size: number; entries: AgentLogEntry[] }>();

function parseAgentFileCached(path: string, agentId: string): AgentLogEntry[] {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  const cached = entryCache.get(path);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.entries;
  }
  const events = parseJsonlFile(path);
  const entries = events.map((evt) => eventToLogEntry(evt, agentId));
  // Simple bound: evict the oldest entry once over capacity (Map preserves
  // insertion order). Re-set moves the key to the newest position.
  entryCache.delete(path);
  entryCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, entries });
  if (entryCache.size > MAX_CACHE_ENTRIES) {
    const oldest = entryCache.keys().next().value;
    if (oldest !== undefined) entryCache.delete(oldest);
  }
  return entries;
}

export function getAgentEvents(
  sessionInfo: SessionInfo,
  agentId: string
): AgentLogEntry[] {
  const path = agentId === "main" ? sessionInfo.path : findSubagentFile(sessionInfo.id, agentId);
  if (!path) return [];
  return parseAgentFileCached(path, agentId);
}
