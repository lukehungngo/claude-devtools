import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  AgentNode,
  SessionEvent,
  AssistantEvent,
  ContentItem,
  SubagentMeta,
} from "../lib/types";
import { normalizeContent } from "../lib/normalizeContent";
import { formatTime } from "../lib/formatTime";
import { formatCost, formatDuration } from "../lib/cost";

// ─── Types ───────────────────────────────────────────────────────────

export interface LogEntry {
  uuid: string;
  timestamp: string;
  agentId: string;
  agentType: string;
  message: string;
  toolName: string | null;
  isError: boolean;
  /** Estimated cost for this log entry (from assistant events) */
  cost: number;
}

interface AggregatedLogEntry extends LogEntry {
  count: number;
}

/** Sonnet pricing constants for per-entry cost estimation */
const INPUT_COST_PER_TOKEN = 0.000003;
const OUTPUT_COST_PER_TOKEN = 0.000015;
interface InvocationGroup {
  agentId: string;
  agentType: string;
  invocationNumber: number;
  entries: AggregatedLogEntry[];
  startTime: string;
  endTime: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Estimated cost (sonnet pricing) */
  cost: number;
}


type FlatItem =
  | { kind: "header"; group: InvocationGroup; groupKey: string }
  | { kind: "entry"; entry: AggregatedLogEntry; groupKey: string };

function computeGroupDuration(startTime: string, endTime: string): number {
  try {
    return new Date(endTime).getTime() - new Date(startTime).getTime();
  } catch {
    return 0;
  }
}
function groupByInvocation(entries: AggregatedLogEntry[]): InvocationGroup[] {
  if (entries.length === 0) return [];
  const groups: InvocationGroup[] = [];
  const agentInvocationCounts = new Map<string, number>();
  let currentGroup: InvocationGroup | null = null;

  for (const entry of entries) {
    if (!currentGroup || currentGroup.agentId !== entry.agentId) {
      // Start a new group
      const count = (agentInvocationCounts.get(entry.agentId) ?? 0) + 1;
      agentInvocationCounts.set(entry.agentId, count);
      currentGroup = {
        agentId: entry.agentId,
        agentType: entry.agentType,
        invocationNumber: count,
        entries: [entry],
        startTime: entry.timestamp,
        endTime: entry.timestamp,
        durationMs: 0,
        cost: entry.cost,
      };
      groups.push(currentGroup);
    } else {
      currentGroup.entries.push(entry);
      currentGroup.endTime = entry.timestamp;
      currentGroup.cost += entry.cost;
    }
  }
  // Compute duration for each group
  for (const group of groups) {
    group.durationMs = computeGroupDuration(group.startTime, group.endTime);
  }
  return groups;
}


// Fixed tabs that always appear
const FIXED_TABS = ["All", "Errors"] as const;

// ─── Agent type colors ───────────────────────────────────────────────

import { getAgentBadgeStyle } from "../lib/agentColors";

// ─── Action badge colors ─────────────────────────────────────────────

function getActionBadgeStyle(toolName: string | null): {
  background: string;
  color: string;
  label: string;
} {
  if (!toolName) {
    return {
      background: "var(--bg-4)",
      color: "var(--text-2)",
      label: "msg",
    };
  }

  const name = toolName.toLowerCase();
  if (name === "read" || name === "grep" || name === "glob") {
    return {
      background: "var(--cyan-dim)",
      color: "var(--cyan)",
      label: toolName,
    };
  }
  if (name === "write" || name === "edit") {
    return {
      background: "var(--green-dim)",
      color: "var(--green)",
      label: toolName,
    };
  }
  if (name === "bash") {
    return {
      background: "var(--orange)",
      color: "#000",
      label: toolName,
    };
  }
  if (name === "thinking" || name === "think") {
    return {
      background: "var(--purple)",
      color: "#000",
      label: "think",
    };
  }
  if (name === "error") {
    return {
      background: "var(--red-dim)",
      color: "var(--red)",
      label: "error",
    };
  }
  if (name === "spawn" || name === "completed") {
    return {
      background: "var(--green-dim)",
      color: "var(--green)",
      label: toolName,
    };
  }
  // Default for MCP or unknown tools
  return {
    background: "var(--orange)",
    color: "#000",
    label: toolName.length > 12 ? toolName.slice(0, 12) + "\u2026" : toolName,
  };
}

// ─── Transform SessionEvents to LogEntries ───────────────────────────

function resolveAgentType(
  agentId: string | undefined,
  agentMap: Map<string, AgentNode>,
  subagentMeta?: SubagentMeta
): string {
  if (!agentId) return "main";
  const fromDag = agentMap.get(agentId)?.type;
  if (fromDag) return fromDag;
  const fromMeta = subagentMeta?.[agentId]?.agentType;
  if (fromMeta) return fromMeta;
  return "main";
}

function extractToolInfo(
  content: ContentItem
): { toolName: string; message: string } | null {
  if (content.type === "tool_use") {
    const name = content.name || "";
    const shortName = name.startsWith("mcp__")
      ? name.split("__").pop() || name
      : name;
    const input = (content.input || {}) as Record<string, unknown>;
    const filePath =
      input.file_path ||
      input.path ||
      input.command;
    return {
      toolName: shortName,
      message: filePath
        ? `${shortName}: ${String(filePath).slice(0, 80)}`
        : shortName,
    };
  }
  if (content.type === "tool_result") {
    const raw = content.content;
    const preview = (typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 120);
    return {
      toolName: content.is_error ? "error" : "result",
      message: preview,
    };
  }
  if (content.type === "thinking") {
    return {
      toolName: "thinking",
      message: (content.thinking || "").slice(0, 120),
    };
  }
  if (content.type === "text") {
    return {
      toolName: "",
      message: (content.text || "").slice(0, 120),
    };
  }
  return null;
}

export function eventsToLogEntries(
  events: SessionEvent[],
  agents: AgentNode[],
  subagentMeta?: SubagentMeta
): LogEntry[] {
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const entries: LogEntry[] = [];

  for (const event of events) {
    const agentId = event.agentId || "main";
    const agentType = resolveAgentType(event.agentId, agentMap, subagentMeta);

    if (event.type === "assistant") {
      const assistantEvent = event as AssistantEvent;
      // Compute event cost from token usage
      const usage = assistantEvent.message?.usage;
      const eventCost = usage
        ? (usage.input_tokens ?? 0) * INPUT_COST_PER_TOKEN +
          (usage.output_tokens ?? 0) * OUTPUT_COST_PER_TOKEN
        : 0;
      const contentItems = normalizeContent(assistantEvent.message?.content);
      const costPerItem = contentItems.length > 0 ? eventCost / contentItems.length : 0;
      for (const content of contentItems) {
        const info = extractToolInfo(content);
        if (info) {
          entries.push({
            uuid:
              content.type === "tool_use"
                ? content.id
                : `${event.uuid}-${content.type}`,
            timestamp: event.timestamp,
            agentId,
            agentType,
            message: info.message,
            toolName: info.toolName || null,
            isError: content.type === "tool_result" && !!content.is_error,
            cost: costPerItem,
          });
        }
      }
    } else if (event.type === "user") {
      // User events: tool results or user messages
      for (const content of normalizeContent(event.message?.content)) {
        if (content.type === "tool_result") {
          entries.push({
            uuid: `${event.uuid}-result`,
            timestamp: event.timestamp,
            agentId,
            agentType,
            message: (typeof content.content === "string" ? content.content : JSON.stringify(content.content)).slice(0, 120),
            toolName: content.is_error ? "error" : "result",
            isError: !!content.is_error,
            cost: 0,
          });
        } else if (content.type === "text") {
          entries.push({
            uuid: event.uuid,
            timestamp: event.timestamp,
            agentId,
            agentType,
            message: (content.text || "").slice(0, 120),
            toolName: null,
            isError: false,
            cost: 0,
          });
        }
      }
    } else if (event.type === "queue-operation") {
      entries.push({
        uuid: event.uuid,
        timestamp: event.timestamp,
        agentId,
        agentType,
        message: `${event.operation}: ${event.content?.slice(0, 80) || ""}`,
        toolName: event.operation === "enqueue" ? "spawn" : "completed",
        isError: false,
        cost: 0,
      });
    }
    // Skip progress events for cleaner log
  }

  return entries;
}

// ─── Aggregate consecutive identical log entries ──────────────────────

function aggregateLogEntries(entries: LogEntry[]): AggregatedLogEntry[] {
  const result: AggregatedLogEntry[] = [];
  for (const entry of entries) {
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.message === entry.message &&
      prev.agentId === entry.agentId &&
      prev.toolName === entry.toolName
    ) {
      prev.count++;
      continue;
    }
    result.push({ ...entry, count: 1 });
  }
  return result;
}

// ─── Inline highlighting for messages ────────────────────────────────

function highlightMessage(msg: string): React.ReactNode {
  // Simple pattern: file paths and tool call names
  const parts: React.ReactNode[] = [];
  // Match file-like references: word/word.ext or ./path/to/file
  const regex =
    /(\b[\w.-]+\/[\w./-]+\.\w+\b|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(msg)) !== null) {
    if (match.index > lastIndex) {
      parts.push(msg.slice(lastIndex, match.index));
    }
    const text = match[0].replace(/`/g, "");
    parts.push(
      <span
        key={match.index}
        onClick={(e) => {
          e.stopPropagation();
          // Open file in editor via server API
          fetch("/api/open-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath: text }),
          }).catch(() => {
            // Silently fail — editor may not be available
          });
        }}
        style={{
          color: "var(--cyan)",
          fontFamily: "var(--font)",
          fontSize: "10px",
          cursor: "pointer",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLSpanElement).style.textDecoration = "underline";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLSpanElement).style.textDecoration = "none";
        }}
        title={text}
      >
        {text}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < msg.length) {
    parts.push(msg.slice(lastIndex));
  }
  return parts.length > 0 ? <>{parts}</> : msg;
}

// ─── Component ───────────────────────────────────────────────────────

interface Props {
  events: SessionEvent[];
  agents: AgentNode[];
  subagentMeta?: SubagentMeta;
  selectedAgent: string | null;
  toolFilter: string | null;
  onSelectAgent: (id: string) => void;
  onSwitchToGraph?: (agentId: string) => void;
}

export function AgentLogs({
  events,
  agents,
  subagentMeta,
  selectedAgent,
  toolFilter,
  onSelectAgent,
  onSwitchToGraph,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Transform events to log entries
  const allEntries = useMemo(
    () => eventsToLogEntries(events, agents, subagentMeta),
    [events, agents, subagentMeta]
  );

  // Build dynamic filter tabs from unique agent types
  const filterTabs = useMemo(() => {
    const agentTypes = new Set<string>();
    for (const entry of allEntries) {
      const label = normalizeAgentTypeLabel(entry.agentType);
      agentTypes.add(label);
    }
    // Fixed tabs first, then dynamic agent tabs
    const dynamicTabs = Array.from(agentTypes).sort();
    return ["All", ...dynamicTabs, "Errors"];
  }, [allEntries]);

  // Apply filters
  const filteredEntries = useMemo(() => {
    let result = allEntries;

    if (activeFilter === "All") {
      // No filter
    } else if (activeFilter === "Errors") {
      result = result.filter((e) => e.isError);
    } else {
      // Dynamic agent type filter
      result = result.filter((e) => {
        const label = normalizeAgentTypeLabel(e.agentType);
        return label === activeFilter;
      });
    }

    // Tool filter from TopBar
    if (toolFilter) {
      result = result.filter(
        (e) =>
          e.toolName?.toLowerCase() === toolFilter.toLowerCase()
      );
    }

    return result;
  }, [allEntries, activeFilter, toolFilter]);

  // Aggregate consecutive identical entries
  const aggregatedEntries = useMemo(
    () => aggregateLogEntries(filteredEntries),
    [filteredEntries]
  );

  // Build invocation groups
  const invocationGroups = useMemo(
    () => groupByInvocation(aggregatedEntries),
    [aggregatedEntries]
  );

  // Flatten groups into a list of renderable items for virtualization
  const flatItems: FlatItem[] = useMemo(() => {
    const items: FlatItem[] = [];
    for (const group of invocationGroups) {
      const groupKey = `${group.agentId}-inv${group.invocationNumber}`;
      items.push({ kind: "header", group, groupKey });
      if (!collapsedGroups.has(groupKey)) {
        for (const entry of group.entries) {
          items.push({ kind: "entry", entry, groupKey });
        }
      }
    }
    return items;
  }, [invocationGroups, collapsedGroups]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index: number) => flatItems[index]?.kind === "header" ? 28 : 32,
    overscan: 20,
  });

  // Auto-scroll using virtualizer
  useEffect(() => {
    if (autoScroll && flatItems.length > 0) {
      virtualizer.scrollToIndex(flatItems.length - 1, { align: "end" });
    }
  }, [flatItems.length, autoScroll, virtualizer]);

  // Detect scroll position to toggle auto-scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  const resumeAutoScroll = useCallback(() => {
    setAutoScroll(true);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-2)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--text-2)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ opacity: 0.6 }}
          >
            <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0z" />
          </svg>
          Agents Log
          <span
            style={{
              fontSize: "9px",
              padding: "1px 5px",
              borderRadius: "8px",
              fontWeight: 600,
              background: "var(--accent-dim)",
              color: "var(--accent)",
            }}
          >
            {agents.length} agents
          </span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {!autoScroll && (
            <button
              onClick={resumeAutoScroll}
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-sm)",
                color: "var(--accent)",
                cursor: "pointer",
                border: "none",
                background: "var(--accent-dim)",
                transition: "all 0.15s",
                fontSize: "12px",
              }}
              title="Resume auto-scroll"
            >
              &#x2193;
            </button>
          )}
        </div>
      </div>

      {/* Filter bar — dynamic tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-2)",
          flexShrink: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              style={{
                padding: "3px 8px",
                borderRadius: "3px",
                fontSize: "10px",
                color: isActive ? "var(--text-0)" : "var(--text-2)",
                cursor: "pointer",
                transition: "all 0.15s",
                border: isActive
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
                background: isActive
                  ? "var(--accent-dim)"
                  : "transparent",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {tab}
            </button>
          );
        })}
        {toolFilter && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "10px",
              color: "var(--orange)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            Tool: {toolFilter}
          </span>
        )}
      </div>

      {/* Log entries - virtualized */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: 0,
          position: "relative",
        }}
      >
        {aggregatedEntries.length === 0 ? (
          events.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-2)",
                fontSize: "11px",
                gap: "8px",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.3 }}>
                <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0z" />
              </svg>
              <span>Select a session to view agent logs</span>
            </div>
          ) : (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--text-2)",
                fontSize: "11px",
              }}
            >
              No matching log entries
            </div>
          )
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              if (!item) return null;

              if (item.kind === "header") {
                const { group, groupKey } = item;
                const isCollapsed = collapsedGroups.has(groupKey);
                const badgeStyle = getAgentBadgeStyle(group.agentType);

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      onClick={() => {
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(groupKey)) next.delete(groupKey);
                          else next.add(groupKey);
                          return next;
                        });
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "4px 12px",
                        fontSize: "10px",
                        background: "var(--bg-2)",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <span style={{
                        fontSize: "8px",
                        color: "var(--text-2)",
                        transition: "transform 0.15s",
                        transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      }}>
                        {"\u25BC"}
                      </span>
                      <span style={{
                        padding: "1px 6px",
                        borderRadius: "3px",
                        fontWeight: 600,
                        fontSize: "10px",
                        background: badgeStyle.background,
                        color: badgeStyle.color,
                        cursor: "pointer",
                      }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAgent(group.agentId);
                        }}
                      >
                        {normalizeAgentTypeLabel(group.agentType)}
                      </span>
                      <span style={{ color: "var(--text-2)", fontSize: "9px" }}>
                        inv #{group.invocationNumber}
                      </span>
                      <span style={{ color: "var(--text-2)", fontSize: "9px" }}>
                        {formatTime(group.startTime)} - {formatTime(group.endTime)}
                      </span>
                      {group.durationMs > 0 && (
                        <span style={{ color: "var(--text-2)", fontSize: "9px", fontFamily: "var(--font)" }}>
                          {formatDuration(group.durationMs)}
                        </span>
                      )}
                      {group.cost > 0 && (
                        <span style={{
                          fontSize: "9px",
                          padding: "1px 5px",
                          borderRadius: "3px",
                          fontWeight: 600,
                          background: "var(--green-dim)",
                          color: "var(--green)",
                          fontFamily: "var(--font)",
                        }}>
                          {formatCost(group.cost)}
                        </span>
                      )}
                      <span style={{
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "8px",
                        fontWeight: 600,
                        background: "var(--bg-4)",
                        color: "var(--text-2)",
                      }}>
                        {group.entries.length}
                      </span>
                    </div>
                  </div>
                );
              }

              // Entry row
              const { entry } = item;
              const actionStyle = getActionBadgeStyle(entry.toolName);
              const isHighlighted = selectedAgent && entry.agentId === selectedAgent;
              const badgeStyle = getAgentBadgeStyle(entry.agentType);

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "68px 80px 1fr auto",
                      gap: "8px",
                      padding: "6px 12px",
                      fontSize: "11px",
                      borderBottom: "1px solid var(--border)",
                      alignItems: "start",
                      transition: "background 0.1s",
                      background: isHighlighted ? "var(--bg-2)" : undefined,
                    }}
                  >
                    <div style={{
                      fontFamily: "var(--font)",
                      color: "var(--text-2)",
                      fontSize: "10px",
                    }}>
                      {formatTime(entry.timestamp)}
                    </div>
                    <div
                      onClick={() => onSwitchToGraph?.(entry.agentId)}
                      style={{
                        fontFamily: "var(--font)",
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: "3px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textAlign: "center",
                        cursor: "pointer",
                        background: badgeStyle.background,
                        color: badgeStyle.color,
                      }}
                    >
                      {normalizeAgentTypeLabel(entry.agentType)}
                    </div>
                    <div style={{
                      color: "var(--text-1)",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {highlightMessage(entry.message)}
                      </span>
                      {entry.count > 1 && (
                        <span style={{
                          fontSize: "9px",
                          padding: "1px 5px",
                          borderRadius: "8px",
                          fontWeight: 600,
                          background: "var(--bg-4)",
                          color: "var(--text-2)",
                          flexShrink: 0,
                        }}>
                          x{entry.count}
                        </span>
                      )}
                    </div>
                    {entry.toolName && (
                      <div style={{
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                        background: actionStyle.background,
                        color: actionStyle.color,
                      }}>
                        {actionStyle.label}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function normalizeAgentTypeLabel(type: string): string {
  if (type === "general-purpose") return "General";
  return type;
}
