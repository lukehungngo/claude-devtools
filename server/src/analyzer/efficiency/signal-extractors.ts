import { normalizeContent } from "../../lib/normalizeContent.js";
import type { SessionEvent, ToolUseContent } from "../../types.js";

export interface ToolSignals {
  totalToolCalls: number;
  failedToolCalls: number;
  failuresByTool: Map<string, number>;
}

export interface EfficiencyTurn {
  sessionId: string;
  index: number;
  startTime: string;
  endTime: string;
  durationMs: number | null;
  inputTokens: number;
  toolCalls: number;
}

export interface EditDecisionSignals {
  totalDecisions: number;
  rejectedDecisions: number;
  rejectedSessions: Map<string, number>;
}

const EDIT_CAPABLE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

export function isEditCapableTool(toolName: string): boolean {
  return EDIT_CAPABLE_TOOLS.has(toolName);
}

export function collectToolSignals(events: SessionEvent[]): ToolSignals {
  const toolNamesById = new Map<string, string>();
  const failuresByTool = new Map<string, number>();
  let totalToolCalls = 0;
  let failedToolCalls = 0;

  for (const event of events) {
    if (event.type === "assistant") {
      for (const content of normalizeContent(event.message.content)) {
        if (content.type !== "tool_use") continue;
        totalToolCalls += 1;
        toolNamesById.set(content.id, content.name);
      }
      continue;
    }

    if (event.type !== "user") continue;
    for (const content of normalizeContent(event.message.content)) {
      if (content.type !== "tool_result" || content.is_error !== true) continue;
      failedToolCalls += 1;
      const toolName = toolNamesById.get(content.tool_use_id) ?? "unknown";
      failuresByTool.set(toolName, (failuresByTool.get(toolName) ?? 0) + 1);
    }
  }

  return { totalToolCalls, failedToolCalls, failuresByTool };
}

export function estimateLocChanged(toolName: string, input: Record<string, unknown>): number {
  if (toolName === "Edit") {
    return Math.max(lineCount(input.old_string), lineCount(input.new_string));
  }

  if (toolName === "Write" || toolName === "NotebookEdit") {
    return lineCount(input.content ?? input.new_string);
  }

  if (toolName === "MultiEdit") {
    const edits = input.edits;
    if (!Array.isArray(edits)) return 0;
    return edits.reduce((sum, edit) => {
      if (!isRecord(edit)) return sum;
      return sum + Math.max(lineCount(edit.old_string), lineCount(edit.new_string));
    }, 0);
  }

  return 0;
}

export function groupEfficiencyTurns(events: SessionEvent[]): EfficiencyTurn[] {
  const turns: EfficiencyTurn[] = [];
  let current: EfficiencyTurn | null = null;

  for (const event of events) {
    if (isExternalPrompt(event)) {
      current = {
        sessionId: event.sessionId,
        index: turns.length,
        startTime: event.timestamp,
        endTime: event.timestamp,
        durationMs: null,
        inputTokens: 0,
        toolCalls: 0,
      };
      turns.push(current);
      continue;
    }

    if (!current) continue;
    current.endTime = event.timestamp;

    if (event.type === "assistant") {
      const usage = event.message.usage;
      current.inputTokens +=
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0);
      for (const content of normalizeContent(event.message.content)) {
        if (content.type === "tool_use") current.toolCalls += 1;
      }
      continue;
    }

    if (event.type === "system" && event.subtype === "turn_duration" && typeof event.durationMs === "number") {
      current.durationMs = event.durationMs;
      current.endTime = event.timestamp;
    }
  }

  return turns;
}

export function collectEditDecisions(events: SessionEvent[]): EditDecisionSignals {
  const editToolUses = new Map<string, ToolUseContent>();
  const deniedToolUseIds = new Set<string>();
  const deniedWithoutId: SessionEvent[] = [];
  const rejectedSessions = new Map<string, number>();

  for (const event of events) {
    if (event.type === "assistant") {
      for (const content of normalizeContent(event.message.content)) {
        if (content.type === "tool_use" && isEditCapableTool(content.name)) {
          editToolUses.set(content.id, content);
        }
      }
      continue;
    }

    if (event.type !== "system" || event.subtype !== "permission_denied") continue;
    const fields = event as unknown as Record<string, unknown>;
    const toolName = String(fields.tool_name ?? fields.toolName ?? "");
    if (!isEditCapableTool(toolName)) continue;
    const toolUseId = typeof fields.tool_use_id === "string" ? fields.tool_use_id : undefined;
    if (toolUseId) {
      deniedToolUseIds.add(toolUseId);
    } else {
      deniedWithoutId.push(event);
    }
    rejectedSessions.set(event.sessionId, (rejectedSessions.get(event.sessionId) ?? 0) + 1);
  }

  const rejectedDecisions = deniedToolUseIds.size + deniedWithoutId.length;
  const approvedDecisions = Array.from(editToolUses.keys()).filter((id) => !deniedToolUseIds.has(id)).length;

  return {
    totalDecisions: rejectedDecisions + approvedDecisions,
    rejectedDecisions,
    rejectedSessions,
  };
}

function isExternalPrompt(event: SessionEvent): boolean {
  return event.type === "user" && event.userType === "external" && event.isMeta !== true;
}

function lineCount(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) return 0;
  return value.split(/\r?\n/).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
