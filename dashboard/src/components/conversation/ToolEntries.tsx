import { memo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { SessionEvent, AssistantEvent, UserEvent, ContentItem, ToolUseContent, ToolResultContent } from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { ToolResultBlock } from "../viewer/ToolResultBlock";
import { DiffBlock } from "../viewer/DiffBlock";
import { AgentCard } from "./AgentCard";
import { ExpandHint } from "./ExpandHint";

interface ToolEntriesProps {
  events: SessionEvent[];
  onToolClick?: (toolName: string) => void;
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

/** Map tool name to a CSS color variable for the left border. Error always overrides. */
function getToolBorderColor(toolName: string, status: string): string {
  if (status === "error") return "var(--red)";
  const name = toolName.toLowerCase();
  if (name === "read" || name === "glob" || name === "listdir" || name === "ls" || name === "tree") return "var(--teal)";
  if (name === "grep" || name === "websearch" || name === "webfetch") return "var(--pur)";
  if (name === "bash" || name === "execute") return "var(--amb)";
  if (name === "edit" || name === "write") return "var(--grn)";
  if (name === "task" || name === "agent" || name === "dispatch" || name.includes("dispatch") || name.includes("agent")) return "var(--acc)";
  return "var(--bd)";
}

/** Build a human-readable summary for a single tool entry. */
function buildSemanticSummary(entry: ToolEntry): string {
  const name = entry.name;
  const target = entry.target;
  const lName = name.toLowerCase();

  if (lName === "grep" || lName === "glob") {
    const pattern = entry.toolInput?.pattern as string | undefined;
    if (pattern) return `${name} "${pattern}"`;
    return target ? `${name} "${target}"` : name;
  }
  if (lName === "bash" || lName === "execute") {
    const cmd = (entry.toolInput?.command as string) || target;
    if (cmd) return `${name} ${cmd.length > 60 ? cmd.slice(0, 60) + "\u2026" : cmd}`;
    return name;
  }
  if (lName === "task" || lName.includes("dispatch") || lName.includes("agent")) {
    const desc = (entry.toolInput?.description as string) || (entry.toolInput?.prompt as string) || target;
    return desc ? `Dispatched ${desc.length > 60 ? desc.slice(0, 60) + "\u2026" : desc}` : `Dispatched ${name}`;
  }
  if (name.startsWith("mcp__") || name.startsWith("mcp_")) {
    const parts = entry.name.split("__");
    const server = parts.length > 1 ? parts[1] : entry.name;
    return `Queried ${server}`;
  }
  // Read, Edit, Write, ListDir, and others: "Name target"
  return target ? `${name} ${target}` : name;
}

/** Build a human-readable summary for a collapsed group. */
function buildGroupSummary(group: ToolGroup): string {
  const count = group.entries.length;
  const name = group.name;
  const lName = name.toLowerCase();

  if (lName === "read") return `Read ${count} files`;
  if (lName === "edit") return `Edit ${count} files`;
  if (lName === "write") return `Write ${count} files`;
  if (lName === "grep") return `Grep ${count} patterns`;
  if (lName === "bash" || lName === "execute") return `Ran ${count} commands`;
  if (lName === "glob") return `Glob ${count} patterns`;
  if (lName === "listdir" || lName === "ls" || lName === "tree") return `Listed ${count} directories`;
  return `${name} x${count}`;
}

/** Check if a tool entry represents an agent dispatch (Task, Agent, dispatch_agent, etc.) */
function isAgentDispatch(name: string): boolean {
  const lName = name.toLowerCase();
  return lName === "task" || lName === "agent" || lName.includes("dispatch") || lName.includes("subagent");
}

/** Extract agent name from tool input for agent dispatch entries. */
function extractAgentName(entry: ToolEntry): string {
  const input = entry.toolInput || {};
  return (
    (input.subagent_type as string) ||
    (input.type as string) ||
    entry.name
  );
}

/** Extract agent description from tool input. */
function extractAgentDescription(entry: ToolEntry): string {
  const input = entry.toolInput || {};
  const desc =
    (input.prompt as string) ||
    (input.description as string) ||
    entry.target ||
    "";
  return typeof desc === "string" ? desc.split("\n")[0] : "";
}

/** Format agent result content for display inside AgentCard children. */
function formatAgentResult(content: string | unknown[]): string {
  if (typeof content === "string") {
    return content.length > 500 ? content.slice(0, 500) + "\u2026" : content;
  }
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const item of content) {
      if (
        item != null &&
        typeof item === "object" &&
        "type" in item &&
        (item as Record<string, unknown>).type === "text" &&
        "text" in item
      ) {
        textParts.push(String((item as Record<string, unknown>).text));
      }
    }
    const joined = textParts.join("\n");
    return joined.length > 500 ? joined.slice(0, 500) + "\u2026" : joined;
  }
  return String(content);
}

/** Map tool name + status to a human-readable progress verb. */
const PROGRESS_MAP: Record<string, { running: string; completed: string }> = {
  read: { running: "Reading...", completed: "Read" },
  grep: { running: "Searching...", completed: "Searched" },
  websearch: { running: "Searching...", completed: "Searched" },
  bash: { running: "Running...", completed: "Ran" },
  execute: { running: "Running...", completed: "Ran" },
  edit: { running: "Editing...", completed: "Edited" },
  write: { running: "Writing...", completed: "Wrote" },
  glob: { running: "Globbing...", completed: "Globbed" },
  task: { running: "Dispatching...", completed: "Dispatched" },
  agent: { running: "Dispatching...", completed: "Dispatched" },
};

export function getProgressText(toolName: string, status: string): string {
  const key = toolName.toLowerCase();
  const entry = PROGRESS_MAP[key];
  if (status === "running") {
    return entry ? entry.running : "Running...";
  }
  return entry ? entry.completed : toolName;
}

const STATUS_ICONS: Record<string, { char: string; className: string }> = {
  success: { char: "\u2713", className: "tool-ok" },
  running: { char: "\u25B6", className: "tool-run" },
  error: { char: "\u2717", className: "tool-err" },
};

const ToolEntryRow = memo(function ToolEntryRow({ entry, isLast, onToolClick }: { entry: ToolEntry; isLast: boolean; onToolClick?: (toolName: string) => void }) {
  // Agent dispatch entries render as AgentCard instead of normal tool row
  if (isAgentDispatch(entry.name)) {
    return (
      <AgentCard
        agentName={extractAgentName(entry)}
        description={extractAgentDescription(entry)}
        status={entry.status}
      >
        {entry.resultContent != null && (
          <div className="font-mono" style={{ fontSize: 10, color: "var(--t3)", lineHeight: 1.5 }}>
            <pre className="whitespace-pre-wrap break-words" style={{ maxHeight: 120, overflow: "auto", margin: 0 }}>
              {formatAgentResult(entry.resultContent)}
            </pre>
          </div>
        )}
      </AgentCard>
    );
  }

  // Collapsed by default — only show one-line summary. Expand on click to reveal result.
  const [isExpanded, setIsExpanded] = useState(entry.status === "error");

  const icon = STATUS_ICONS[entry.status];
  const borderColor = getToolBorderColor(entry.name, entry.status);
  const summary = buildSemanticSummary(entry);
  const progressText = getProgressText(entry.name, entry.status);
  const isRunning = entry.status === "running";
  const hasDetail = entry.resultContent != null || (entry.name === "Edit" && entry.toolInput) || (entry.name === "Write" && entry.toolInput);

  return (
    <div key={entry.id}>
      <div
        onClick={() => {
          if (hasDetail) {
            setIsExpanded((prev) => !prev);
          } else {
            onToolClick?.(entry.name);
          }
        }}
        className="group flex items-center cursor-pointer"
        style={{
          padding: "4px 12px",
          gap: 8,
          fontSize: 11,
          borderLeft: `3px solid ${borderColor}`,
          borderBottom: isLast && !isExpanded ? "none" : "1px solid var(--bd)",
          transition: "background .1s",
        }}
      >
        {hasDetail && !isRunning ? (
          isExpanded ? (
            <ChevronDown size={10} style={{ color: "var(--t3)" }} className="shrink-0" />
          ) : (
            <ChevronRight size={10} style={{ color: "var(--t3)" }} className="shrink-0" />
          )
        ) : null}
        {isRunning ? (
          <span
            className="running-dot shrink-0"
            aria-label="Running"
            style={{ color: "var(--amb)" }}
          />
        ) : (
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
        )}
        <span
          className="flex-1 font-mono overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            fontSize: 11,
            color: "var(--t2)",
            opacity: isRunning ? 0.7 : 1,
            animation: isRunning ? "pulse-opacity 2s infinite" : "none",
          }}
        >
          {isRunning
            ? `${progressText}${entry.target ? ` ${entry.target}` : ""}`
            : summary}
        </span>
        {hasDetail && !isRunning && <ExpandHint text={isExpanded ? "click to collapse" : undefined} />}
      </div>
      {isExpanded && entry.resultContent != null && (
        <ToolResultBlock
          content={entry.resultContent}
          isError={entry.resultIsError ?? false}
          toolName={entry.name}
        />
      )}
      {isExpanded && entry.name === "Edit" && entry.toolInput && (
        <DiffBlock
          oldContent={String(entry.toolInput.old_string ?? "")}
          newContent={String(entry.toolInput.new_string ?? "")}
          filePath={String(entry.toolInput.file_path ?? "")}
        />
      )}
      {isExpanded && entry.name === "Write" && entry.toolInput && (
        <DiffBlock
          oldContent=""
          newContent={String(entry.toolInput.content ?? "")}
          filePath={String(entry.toolInput.file_path ?? "")}
        />
      )}
    </div>
  );
});

function CollapsedGroupRowInner({ group, isLast }: { group: ToolGroup; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const count = group.entries.length;
  const allSuccess = group.entries.every((e) => e.status === "success");
  const anyRunning = group.entries.some((e) => e.status === "running");
  const groupStatus = anyRunning ? "running" : allSuccess ? "success" : "running";
  const icon = STATUS_ICONS[groupStatus];
  const borderColor = getToolBorderColor(group.name, groupStatus);
  const summary = buildGroupSummary(group);

  return (
    <div>
      <div
        role="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="group flex items-center cursor-pointer"
        style={{
          padding: "4px 12px",
          gap: 8,
          fontSize: 11,
          borderLeft: `3px solid ${borderColor}`,
          borderBottom: isLast && !isExpanded ? "none" : "1px solid var(--bd)",
        }}
      >
        {isExpanded ? (
          <ChevronDown data-testid="chevron-down" size={10} style={{ color: "var(--t3)" }} className="shrink-0" />
        ) : (
          <ChevronRight data-testid="chevron-right" size={10} style={{ color: "var(--t3)" }} className="shrink-0" />
        )}
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
          {summary}
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
          {count}
        </span>
        <ExpandHint />
      </div>
      {isExpanded && (
        <div
          role="list"
          style={{
            borderLeft: `3px solid ${borderColor}`,
            borderBottom: isLast ? "none" : "1px solid var(--bd)",
          }}
        >
          {group.entries.map((entry) => (
            <div
              key={entry.id}
              role="listitem"
              className="flex items-center"
              style={{ paddingLeft: 20, padding: "4px 12px 4px 20px", gap: 8, fontSize: 11 }}
            >
              <span
                data-testid="sub-row-dot"
                className="shrink-0"
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  backgroundColor: getToolBorderColor(entry.name, entry.status),
                }}
              />
              <span
                className="font-mono overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ fontSize: 11, color: "var(--t3)" }}
              >
                {entry.target || entry.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CollapsedGroupRow = memo(CollapsedGroupRowInner);

export function ToolEntries({ events, onToolClick }: ToolEntriesProps) {
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
            onToolClick={onToolClick}
          />
        ));
      })}
    </div>
  );
}
