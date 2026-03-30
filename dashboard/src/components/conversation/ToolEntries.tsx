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

/** A group of consecutive same-name tool entries, or a single error entry */
interface ToolGroup {
  name: string;
  entries: ToolEntry[];
  isCollapsed: boolean;
}

/**
 * Group consecutive same-name, non-error tool entries.
 * Errors always shown individually (never collapsed into a passing group).
 */
function groupToolEntries(entries: ToolEntry[]): ToolGroup[] {
  const groups: ToolGroup[] = [];

  for (const entry of entries) {
    // Errors always get their own group
    if (entry.status === "error") {
      groups.push({ name: entry.name, entries: [entry], isCollapsed: false });
      continue;
    }

    const last = groups[groups.length - 1];
    if (last && last.name === entry.name && last.entries[0].status !== "error") {
      last.entries.push(entry);
      last.isCollapsed = last.entries.length > 1;
    } else {
      groups.push({ name: entry.name, entries: [entry], isCollapsed: false });
    }
  }

  return groups;
}

const STATUS_ICONS: Record<string, { char: string; className: string }> = {
  success: { char: "\u2713", className: "tool-ok" },
  running: { char: "\u25B6", className: "tool-run" },
  error: { char: "\u2717", className: "tool-err" },
};

function ToolEntryRow({ entry, isLast }: { entry: ToolEntry; isLast: boolean }) {
  const icon = STATUS_ICONS[entry.status];

  return (
    <div key={entry.id}>
      <div
        className="flex items-center cursor-pointer"
        style={{
          padding: "8px 12px",
          gap: 8,
          fontSize: 11,
          borderBottom: isLast ? "none" : "1px solid var(--bd)",
          transition: "background .1s",
        }}
      >
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
        <span
          className="flex-1 font-mono overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: 11, color: "var(--t2)" }}
        >
          {entry.name}{entry.target ? ` ${entry.target}` : ""}
        </span>
      </div>
      {entry.resultContent != null && (
        <ToolResultBlock
          content={entry.resultContent}
          isError={entry.resultIsError ?? false}
          toolName={entry.name}
        />
      )}
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
}

function CollapsedGroupRow({ group, isLast }: { group: ToolGroup; isLast: boolean }) {
  const count = group.entries.length;
  const allSuccess = group.entries.every((e) => e.status === "success");
  const anyRunning = group.entries.some((e) => e.status === "running");
  const status = anyRunning ? "running" : allSuccess ? "success" : "running";
  const icon = STATUS_ICONS[status];

  return (
    <div
      className="flex items-center"
      style={{
        padding: "8px 12px",
        gap: 8,
        fontSize: 11,
        borderBottom: isLast ? "none" : "1px solid var(--bd)",
      }}
    >
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
      <span
        className="font-mono"
        style={{ fontSize: 11, color: "var(--t2)" }}
      >
        {group.name}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: 9,
          color: "var(--t3)",
          background: "var(--bg-h)",
          padding: "1px 5px",
          borderRadius: "var(--radius)",
        }}
      >
        x{count}
      </span>
    </div>
  );
}

export function ToolEntries({ events }: ToolEntriesProps) {
  const entries = extractToolEntries(events);
  const groups = groupToolEntries(entries);

  if (groups.length === 0) return null;

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
      {groups.map((group, gi) => {
        const isLast = gi === groups.length - 1;
        if (group.isCollapsed) {
          return <CollapsedGroupRow key={`g-${gi}`} group={group} isLast={isLast} />;
        }
        // Single entry or error — show individually
        return group.entries.map((entry, ei) => (
          <ToolEntryRow
            key={entry.id}
            entry={entry}
            isLast={isLast && ei === group.entries.length - 1}
          />
        ));
      })}
    </div>
  );
}
