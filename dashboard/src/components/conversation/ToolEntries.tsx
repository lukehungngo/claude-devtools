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
    <div className="conv-tool-entries flex flex-col gap-0.5 py-1">
      {entries.map((entry) => {
        const icon = STATUS_ICONS[entry.status];

        return (
          <div
            key={entry.id}
            className="flex items-center gap-2 py-0.75 text-base font-mono"
          >
            {/* Status icon */}
            <span
              style={{
                color: icon.color,
                width: "14px",
                textAlign: "center",
              }}
              className="text-xxs w-3.5 text-center shrink-0"
            >
              {icon.char}
            </span>
            {/* Tool name badge */}
            <span
              className="px-1.5 py-px rounded-dt-xs bg-dt-orange text-black text-sm font-semibold whitespace-nowrap shrink-0"
            >
              {entry.name}
            </span>
            {/* File path / command */}
            {entry.target && (
              <span
                className="text-dt-text2 overflow-hidden text-ellipsis whitespace-nowrap text-sm"
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
