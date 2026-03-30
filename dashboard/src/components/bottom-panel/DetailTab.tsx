import { memo, useMemo } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent, UserEvent, ToolUseContent, ToolResultContent, ContentItem } from "../../lib/types";

export interface DetailTabProps {
  turns: TurnSnapshot[];
  allEvents: SessionEvent[];
  activeTurnIndex: number | null;
}

interface ToolCall {
  id: string;
  name: string;
  inputSummary: string;
  status: "success" | "error" | "running";
}

interface ToolGroup {
  name: string;
  calls: ToolCall[];
}

function extractToolCalls(events: SessionEvent[]): ToolGroup[] {
  // Collect tool_use items from assistant events
  const toolUses: ToolUseContent[] = [];
  for (const event of events) {
    if (event.type === "assistant") {
      const msg = (event as AssistantEvent).message;
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === "tool_use") {
            toolUses.push(item as ToolUseContent);
          }
        }
      }
    }
  }

  // Build result map from user events
  const resultMap = new Map<string, boolean>();
  for (const event of events) {
    if (event.type === "user") {
      const msg = (event as UserEvent).message;
      if (Array.isArray(msg.content)) {
        for (const item of msg.content as ContentItem[]) {
          if (item.type === "tool_result") {
            const result = item as ToolResultContent;
            resultMap.set(result.tool_use_id, !!result.is_error);
          }
        }
      }
    }
  }

  // Build tool calls with status
  const calls: ToolCall[] = toolUses.map((tu) => {
    const hasResult = resultMap.has(tu.id);
    const isError = resultMap.get(tu.id) ?? false;
    return {
      id: tu.id,
      name: tu.name,
      inputSummary: getInputSummary(tu.name, tu.input),
      status: hasResult ? (isError ? "error" : "success") : "running",
    };
  });

  // Group by tool name
  const groupMap = new Map<string, ToolCall[]>();
  for (const call of calls) {
    const existing = groupMap.get(call.name);
    if (existing) {
      existing.push(call);
    } else {
      groupMap.set(call.name, [call]);
    }
  }

  return Array.from(groupMap.entries()).map(([name, groupCalls]) => ({
    name,
    calls: groupCalls,
  }));
}

function getInputSummary(toolName: string, input: Record<string, unknown>): string {
  if (input.file_path) return String(input.file_path);
  if (input.command) return String(input.command);
  if (input.pattern) return String(input.pattern);
  if (input.path) return String(input.path);
  const keys = Object.keys(input);
  if (keys.length === 0) return "";
  const first = input[keys[0]];
  if (typeof first === "string") return first.slice(0, 80);
  return keys.join(", ");
}

const STATUS_ICONS: Record<string, { icon: string; color: string; testStatus: string }> = {
  success: { icon: "\u2713", color: "var(--grn)", testStatus: "success" },
  error: { icon: "\u2717", color: "var(--red)", testStatus: "error" },
  running: { icon: "\u25B6", color: "var(--amb)", testStatus: "running" },
};

function DetailTabInner({ turns, allEvents, activeTurnIndex }: DetailTabProps) {
  const activeTurn =
    activeTurnIndex !== null &&
    activeTurnIndex >= 0 &&
    activeTurnIndex < turns.length
      ? turns[activeTurnIndex]
      : undefined;

  const groups = useMemo(() => {
    if (!activeTurn) return [];
    return extractToolCalls(getEventsForTurn(activeTurn, allEvents));
  }, [activeTurn, allEvents]);

  if (!activeTurn) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--t3)", fontSize: 13 }}>Select a turn to see tool details</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--t3)", fontSize: 13 }}>No tool calls in this turn</span>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {groups.map((group) => (
        <div key={group.name}>
          <div
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--t1)",
              background: "var(--bg-s)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{group.name}</span>
            <span style={{ color: "var(--t3)", fontSize: 10 }}>({group.calls.length})</span>
          </div>
          {group.calls.map((call) => {
            const statusInfo = STATUS_ICONS[call.status];
            return (
              <div
                key={call.id}
                style={{
                  padding: "4px 12px 4px 24px",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--t2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  data-status={statusInfo.testStatus}
                  style={{ color: statusInfo.color, flexShrink: 0, width: 14 }}
                >
                  {statusInfo.icon}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {call.inputSummary}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const DetailTab = memo(DetailTabInner);
