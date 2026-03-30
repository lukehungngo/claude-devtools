import type { SessionEvent, AssistantEvent, UserEvent, ContentItem, ToolUseContent, ToolResultContent } from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { ToolResultBlock } from "../viewer/ToolResultBlock";
import { DiffBlock } from "../viewer/DiffBlock";

interface ToolEntriesProps {
  events: SessionEvent[];
}

interface ToolEntry {
  id: string;
  name: string;
  target: string;
  status: "success" | "running" | "error";
  resultContent?: string | unknown[];
  resultIsError?: boolean;
  toolInput?: Record<string, unknown>;
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
            toolInput: input,
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
            existing.resultContent = result.content;
            existing.resultIsError = result.is_error ?? false;
          }
        }
      }
    }
  }

  return entries;
}

const STATUS_ICONS: Record<string, { char: string; className: string }> = {
  success: { char: "\u2713", className: "tool-ok" },
  running: { char: "\u25B6", className: "tool-run" },
  error: { char: "\u2717", className: "tool-err" },
};

export function ToolEntries({ events }: ToolEntriesProps) {
  const entries = extractToolEntries(events);

  if (entries.length === 0) return null;

  return (
    <div
      className="conv-tool-entries"
      style={{
        background: "var(--bg-s)",
        border: "1px solid var(--bd)",
        borderRadius: "var(--radius)",
        marginTop: 10,
        overflow: "hidden",
      }}
    >
      {entries.map((entry, i) => {
        const icon = STATUS_ICONS[entry.status];

        return (
          <div key={entry.id}>
            <div
              className="flex items-center cursor-pointer"
              style={{
                padding: "8px 12px",
                gap: 8,
                fontSize: 11,
                borderBottom: i < entries.length - 1 ? "1px solid var(--bd)" : "none",
                transition: "background .1s",
              }}
            >
              {/* Status icon */}
              <span
                className={`shrink-0 ${icon.className}`}
                style={{
                  fontSize: 11,
                  color: icon.className === "tool-ok" ? "var(--grn)"
                    : icon.className === "tool-err" ? "var(--red)"
                    : "var(--amb)",
                }}
              >
                {icon.char}
              </span>
              {/* Tool name + target */}
              <span
                className="flex-1 font-mono overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ fontSize: 11, color: "var(--t2)" }}
              >
                {entry.name}{entry.target ? ` ${entry.target}` : ""}
              </span>
              {/* Duration placeholder */}
              {entry.status === "success" && (
                <span className="font-mono" style={{ fontSize: 10, color: "var(--t3)" }}>
                  {"\u2713"}
                </span>
              )}
            </div>
            {/* Tool result (expandable) */}
            {entry.resultContent != null && (
              <ToolResultBlock
                content={entry.resultContent}
                isError={entry.resultIsError ?? false}
                toolName={entry.name}
              />
            )}
            {/* Diff view for Edit/Write tools */}
            {entry.name === "Edit" && entry.toolInput && (
              <DiffBlock
                oldContent={String(entry.toolInput.old_string ?? "")}
                newContent={String(entry.toolInput.new_string ?? "")}
                filePath={String(entry.toolInput.file_path ?? "")}
              />
            )}
            {entry.name === "Write" && entry.toolInput && (
              <DiffBlock
                oldContent=""
                newContent={String(entry.toolInput.content ?? "")}
                filePath={String(entry.toolInput.file_path ?? "")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
