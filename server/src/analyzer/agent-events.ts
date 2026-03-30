import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { SessionInfo, AgentLogEntry, SessionEvent, ContentItem } from "../types.js";
import { parseJsonlFile } from "../parser/jsonl-reader.js";
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

function eventToLogEntry(event: SessionEvent, agentId: string): AgentLogEntry {
  let contentPreview = "";

  if (event.type === "user" || event.type === "assistant") {
    contentPreview = getContentPreview(normalizeContent(event.message.content));
  } else if (event.type === "progress") {
    contentPreview = event.data?.type || "progress";
  } else if (event.type === "queue-operation") {
    contentPreview = `queue: ${event.operation}`;
  }

  return {
    timestamp: event.timestamp,
    eventType: event.type,
    agentId,
    contentPreview,
    uuid: event.uuid,
  };
}

export function getAgentEvents(
  sessionInfo: SessionInfo,
  agentId: string
): AgentLogEntry[] {
  const projectsDir = join(homedir(), ".claude", "projects");

  let events: SessionEvent[];

  if (agentId === "main") {
    events = parseJsonlFile(sessionInfo.path);
  } else {
    const subagentPath = join(
      projectsDir,
      sessionInfo.projectHash,
      sessionInfo.id,
      "subagents",
      `agent-${agentId}.jsonl`
    );
    if (!existsSync(subagentPath)) return [];
    events = parseJsonlFile(subagentPath);
  }

  return events.map((evt) => eventToLogEntry(evt, agentId));
}
