import type { SessionEvent, AssistantEvent, UserEvent, ContentItem, ToolUseContent, ToolResultContent } from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";

interface ToolEntriesProps {
  events: SessionEvent[];
}

interface ToolEntry {
  id: string;
  name: string;
  target: string;
  status: "success" | "running" | "error";
}

function extractToolEntries(events: SessionEvent[]): ToolEntry[] {
  const entries: ToolEntry[] = [];
  const toolUseMap = new Map<string, ToolEntry>();

  for (const event of events) {
    if (event.type === "assistant") {
      const asst = event as AssistantEvent;
      for (const content of normalizeContent(asst.message?.content)) {
        if (content.type === "tool_use") {
          const toolUse = content as ToolUseContent;
          const input = (toolUse.input || {}) as Record<string, unknown>;
          const target =
            (input.file_path as string) ||
            (input.path as string) ||
            (input.command as string) ||
            (input.pattern as string) ||
            "";

          const entry: ToolEntry = {
            id: toolUse.id,
            name: toolUse.name.startsWith("mcp__")
              ? toolUse.name.split("__").pop() || toolUse.name
              : toolUse.name,
            target: typeof target === "string" ? target.slice(0, 80) : "",
            status: "running",
          };
          toolUseMap.set(toolUse.id, entry);
          entries.push(entry);
        }
      }
    } else if (event.type === "user") {
      const userEvent = event as UserEvent;
      for (const content of normalizeContent(userEvent.message?.content)) {
        if (content.type === "tool_result") {
          const result = content as ToolResultContent;
          const existing = toolUseMap.get(result.tool_use_id);
          if (existing) {
            existing.status = result.is_error ? "error" : "success";
          }
        }
      }
    }
  }

  return entries;
}

const STATUS_ICONS: Record<string, { char: string; color: string }> = {
  success: { char: "\u2713", color: "var(--green)" },
  running: { char: "\u25CF", color: "var(--accent)" },
  error: { char: "\u2717", color: "var(--red)" },
};

export function ToolEntries({ events }: ToolEntriesProps) {
  const entries = extractToolEntries(events);

  if (entries.length === 0) return null;

  return (
    <div
      className="conv-tool-entries"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "4px 0",
      }}
    >
      {entries.map((entry) => {
        const icon = STATUS_ICONS[entry.status];

        return (
          <div
            key={entry.id}
            className="conv-tool-entry"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "3px 0",
              fontSize: "11px",
              fontFamily: "var(--font)",
            }}
          >
            {/* Status icon */}
            <span
              className="tool-icon"
              style={{
                color: icon.color,
                fontSize: "10px",
                width: "14px",
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              {icon.char}
            </span>
            {/* Tool name badge */}
            <span
              className="tool-name"
              style={{
                padding: "1px 6px",
                borderRadius: "3px",
                background: "var(--orange)",
                color: "#000",
                fontSize: "9px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {entry.name}
            </span>
            {/* File path / command */}
            {entry.target && (
              <span
                className="tool-target"
                style={{
                  color: "var(--text-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "10px",
                }}
              >
                {entry.target}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
