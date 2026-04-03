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
import { formatCost, formatDuration, calculateTurnCost } from "../lib/cost";
import { getAgentBadgeStyle } from "../lib/agentColors";
import { buildExportPayload, downloadJson } from "../lib/exportAgentLog";

// ─── Types ───────────────────────────────────────────────────────────

export interface LogEntry {
  uuid: string;
  timestamp: string;
  agentId: string;
  agentType: string;
  message: string;
  /** Full untruncated message for expand view */
  rawMessage?: string;
  toolName: string | null;
  isError: boolean;
  /** Estimated cost for this log entry (from assistant events) */
  cost: number;
}

export interface TimelineGroup {
  agentId: string;
  agentType: string;
  depth: number;
  entries: LogEntry[];
  startTime: string;
  endTime: string;
  durationMs: number;
  cost: number;
}

type FlatItem =
  | { kind: "agent-header"; group: TimelineGroup; groupIndex: number }
  | { kind: "entry"; entry: LogEntry; depth: number; groupIndex: number; entryIndex: number };

// ─── Action badge colors ─────────────────────────────────────────────

function getActionBadgeStyle(toolName: string | null): {
  border: string;
  color: string;
  label: string;
} {
  if (!toolName) {
    return { border: "var(--text-2)", color: "var(--text-2)", label: "msg" };
  }

  const name = toolName.toLowerCase();
  if (name === "read" || name === "grep" || name === "glob") {
    return { border: "var(--cyan)", color: "var(--cyan)", label: toolName };
  }
  if (name === "write" || name === "edit") {
    return { border: "var(--green)", color: "var(--green)", label: toolName };
  }
  if (name === "bash") {
    return { border: "var(--orange)", color: "var(--orange)", label: toolName };
  }
  if (name === "thinking" || name === "think") {
    return { border: "var(--purple)", color: "var(--purple)", label: "think" };
  }
  if (name === "error") {
    return { border: "var(--red)", color: "var(--red)", label: "error" };
  }
  if (name === "spawn" || name === "completed") {
    return { border: "var(--green)", color: "var(--green)", label: toolName };
  }
  return {
    border: "var(--orange)",
    color: "var(--orange)",
    label: toolName.length > 12 ? toolName.slice(0, 12) + "\u2026" : toolName,
  };
}

/** Extract first non-empty line as a single-line preview. */
function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) || "";
  return line.slice(0, 200);
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
): { toolName: string; message: string; rawMessage?: string } | null {
  if (content.type === "tool_use") {
    const name = content.name || "";
    const shortName = name.startsWith("mcp__")
      ? name.split("__").pop() || name
      : name;
    const input = (content.input || {}) as Record<string, unknown>;
    const filePath = input.file_path || input.path || input.command;
    const preview = filePath
      ? `${shortName}: ${String(filePath).slice(0, 80)}`
      : shortName;
    const rawMessage = filePath
      ? `${shortName}: ${String(filePath)}\n${JSON.stringify(input, null, 2)}`
      : JSON.stringify(input, null, 2);
    return { toolName: shortName, message: preview, rawMessage };
  }
  if (content.type === "tool_result") {
    const raw = content.content;
    const rawMessage = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    return {
      toolName: content.is_error ? "error" : "result",
      message: firstLine(rawMessage),
      rawMessage,
    };
  }
  if (content.type === "thinking") {
    const rawMessage = content.thinking || "";
    return { toolName: "thinking", message: firstLine(rawMessage), rawMessage };
  }
  if (content.type === "text") {
    const rawMessage = content.text || "";
    return { toolName: "", message: firstLine(rawMessage), rawMessage };
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
      const usage = assistantEvent.message?.usage;
      const model = assistantEvent.message?.model || "";
      const eventCost = usage
        ? calculateTurnCost(
            model,
            usage.input_tokens ?? 0,
            usage.output_tokens ?? 0,
            usage.cache_creation_input_tokens ?? 0,
            usage.cache_read_input_tokens ?? 0
          )
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
            rawMessage: info.rawMessage,
            toolName: info.toolName || null,
            isError: content.type === "tool_result" && !!content.is_error,
            cost: costPerItem,
          });
        }
      }
    } else if (event.type === "user") {
      for (const content of normalizeContent(event.message?.content)) {
        if (content.type === "tool_result") {
          entries.push({
            uuid: `${event.uuid}-result`,
            timestamp: event.timestamp,
            agentId,
            agentType,
            message: firstLine(typeof content.content === "string" ? content.content : JSON.stringify(content.content)),
            rawMessage: typeof content.content === "string" ? content.content : JSON.stringify(content.content, null, 2),
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
            message: firstLine(content.text || ""),
            rawMessage: content.text || "",
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
  }

  return entries;
}

// ─── Build depth map from DAG ────────────────────────────────────────

function buildDepthMap(agents: AgentNode[]): Map<string, number> {
  const depthMap = new Map<string, number>();
  const parentMap = new Map<string, string>();

  for (const agent of agents) {
    if (agent.parentId) {
      parentMap.set(agent.id, agent.parentId);
    }
  }

  function getDepth(id: string): number {
    if (depthMap.has(id)) return depthMap.get(id)!;
    const parent = parentMap.get(id);
    const depth = parent ? getDepth(parent) + 1 : 0;
    depthMap.set(id, depth);
    return depth;
  }

  for (const agent of agents) {
    getDepth(agent.id);
  }

  return depthMap;
}

// ─── Group consecutive entries by agent into timeline groups ─────────

function buildTimelineGroups(
  entries: LogEntry[],
  depthMap: Map<string, number>
): TimelineGroup[] {
  if (entries.length === 0) return [];

  const groups: TimelineGroup[] = [];
  let current: TimelineGroup | null = null;

  for (const entry of entries) {
    if (!current || current.agentId !== entry.agentId) {
      current = {
        agentId: entry.agentId,
        agentType: entry.agentType,
        depth: depthMap.get(entry.agentId) ?? (entry.agentId === "main" ? 0 : 1),
        entries: [entry],
        startTime: entry.timestamp,
        endTime: entry.timestamp,
        durationMs: 0,
        cost: entry.cost,
      };
      groups.push(current);
    } else {
      current.entries.push(entry);
      current.endTime = entry.timestamp;
      current.cost += entry.cost;
    }
  }

  for (const group of groups) {
    try {
      group.durationMs = new Date(group.endTime).getTime() - new Date(group.startTime).getTime();
    } catch {
      group.durationMs = 0;
    }
  }

  return groups;
}

// ─── Inline highlighting for messages ────────────────────────────────

function highlightMessage(msg: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\b[\w.-]+\/[\w./-]+\.\w+\b|`[^`]+`)/g;
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
          fetch("/api/open-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath: text }),
          }).catch(() => {});
        }}
        className="text-dt-cyan font-mono text-[10px] cursor-pointer no-underline hover:underline"
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

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeAgentTypeLabel(type: string): string {
  if (type === "general-purpose") return "General";
  return type;
}

// ─── Timeline line colors by depth ───────────────────────────────────

const DEPTH_COLORS = [
  "var(--accent)",
  "var(--cyan)",
  "var(--green)",
  "var(--orange)",
  "var(--purple)",
  "var(--pink)",
];

function getDepthColor(depth: number): string {
  return DEPTH_COLORS[depth % DEPTH_COLORS.length];
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
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [collapsedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((uuid: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }, []);

  // Transform events to log entries
  const allEntries = useMemo(
    () => eventsToLogEntries(events, agents, subagentMeta),
    [events, agents, subagentMeta]
  );

  // Build depth map from DAG
  const depthMap = useMemo(() => buildDepthMap(agents), [agents]);

  // Build filter tabs
  const filterTabs = useMemo(() => {
    const agentTypes = new Set<string>();
    for (const entry of allEntries) {
      agentTypes.add(normalizeAgentTypeLabel(entry.agentType));
    }
    return ["All", ...Array.from(agentTypes).sort(), "Errors"];
  }, [allEntries]);

  // Apply filters
  const filteredEntries = useMemo(() => {
    let result = allEntries;
    if (activeFilter === "Errors") {
      result = result.filter((e) => e.isError);
    } else if (activeFilter !== "All") {
      result = result.filter((e) => normalizeAgentTypeLabel(e.agentType) === activeFilter);
    }
    if (toolFilter) {
      result = result.filter(
        (e) => e.toolName?.toLowerCase() === toolFilter.toLowerCase()
      );
    }
    return result;
  }, [allEntries, activeFilter, toolFilter]);

  // Build timeline groups
  const timelineGroups = useMemo(
    () => buildTimelineGroups(filteredEntries, depthMap),
    [filteredEntries, depthMap]
  );

  // Flatten for virtualizer
  const flatItems: FlatItem[] = useMemo(() => {
    const items: FlatItem[] = [];
    for (let gi = 0; gi < timelineGroups.length; gi++) {
      const group = timelineGroups[gi];
      items.push({ kind: "agent-header", group, groupIndex: gi });
      if (!collapsedGroups.has(gi)) {
        for (let ei = 0; ei < group.entries.length; ei++) {
          items.push({
            kind: "entry",
            entry: group.entries[ei],
            depth: group.depth,
            groupIndex: gi,
            entryIndex: ei,
          });
        }
      }
    }
    return items;
  }, [timelineGroups, collapsedGroups]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index: number) => flatItems[index]?.kind === "agent-header" ? 28 : 22,
    overscan: 20,
  });

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && flatItems.length > 0) {
      virtualizer.scrollToIndex(flatItems.length - 1, { align: "end" });
    }
  }, [flatItems.length, autoScroll, virtualizer]);

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

  const handleExport = useCallback(() => {
    const payload = buildExportPayload(filteredEntries, timelineGroups);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadJson(payload, `agent-log-${timestamp}.json`);
  }, [filteredEntries, timelineGroups]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dt-border shrink-0 bg-dt-bg2/80">
        <div className="text-sm font-semibold uppercase tracking-[0.5px] text-dt-text2 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
            <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0z" />
          </svg>
          Agent Timeline
          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-dt-accent-dim text-dt-accent">
            {agents.length} agents
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleExport}
            className="w-7 h-7 flex items-center justify-center rounded-dt-sm text-dt-text2 cursor-pointer border-none bg-transparent hover:bg-dt-bg3/50 transition-all duration-150 text-sm"
            title="Export agent log as JSON"
          >
            &#x2913;
          </button>
          {!autoScroll && (
            <button
              onClick={resumeAutoScroll}
              className="w-7 h-7 flex items-center justify-center rounded-dt-sm text-dt-accent cursor-pointer border-none bg-dt-accent-dim hover:bg-dt-accent/20 transition-all duration-150 text-sm shadow-dt-sm"
              title="Resume auto-scroll"
            >
              &#x2193;
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-dt-border/50 bg-dt-bg2/60 shrink-0 overflow-x-auto [scrollbar-width:none] dt-scrollbar">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-2.5 py-1 rounded-full text-sm cursor-pointer transition-all duration-150 border whitespace-nowrap shrink-0 ${
                isActive
                  ? "text-dt-text0 border-dt-accent bg-dt-accent-dim font-medium"
                  : "text-dt-text2 border-transparent bg-transparent hover:bg-dt-bg3/50"
              }`}
            >
              {tab}
            </button>
          );
        })}
        {toolFilter && (
          <span className="ml-auto text-sm text-dt-orange flex items-center gap-1 bg-dt-orange-dim px-2 py-0.5 rounded-full">
            Tool: {toolFilter}
          </span>
        )}
      </div>

      {/* Timeline content - virtualized */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-0 relative dt-scrollbar"
      >
        {filteredEntries.length === 0 ? (
          events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-dt-text2 text-base gap-2">
              <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="opacity-30">
                <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0z" />
              </svg>
              <span>Select a session to view agent timeline</span>
            </div>
          ) : (
            <div className="p-5 text-center text-dt-text2 text-base">
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

              if (item.kind === "agent-header") {
                const { group, groupIndex } = item;
                const isCollapsed = collapsedGroups.has(groupIndex);
                const badgeStyle = getAgentBadgeStyle(group.agentType);
                const depthColor = getDepthColor(group.depth);
                const indent = group.depth * 20;

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
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(groupIndex)) next.delete(groupIndex);
                          else next.add(groupIndex);
                          return next;
                        });
                      }}
                      className="flex items-center gap-2 py-1 cursor-pointer select-none border-b border-dt-border/30"
                      style={{ paddingLeft: 12 + indent }}
                    >
                      {/* Timeline dot */}
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: depthColor }}
                      />
                      {/* Collapse arrow */}
                      <span className={`text-[8px] text-dt-text2 transition-transform duration-150 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}>
                        {"\u25BC"}
                      </span>
                      {/* Agent badge */}
                      <span
                        className="px-1.5 py-px rounded-[3px] font-semibold text-[10px] cursor-pointer"
                        style={{ background: badgeStyle.background, color: badgeStyle.color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAgent(group.agentId);
                        }}
                      >
                        {normalizeAgentTypeLabel(group.agentType)}
                      </span>
                      {/* Time range */}
                      <span className="text-dt-text2 text-[10px] font-mono">
                        {formatTime(group.startTime)}
                        {group.durationMs > 0 && ` \u2014 ${formatTime(group.endTime)}`}
                      </span>
                      {group.durationMs > 0 && (
                        <span className="text-dt-text3 text-[10px] font-mono">
                          ({formatDuration(group.durationMs)})
                        </span>
                      )}
                      {group.cost > 0 && (
                        <span className="text-[10px] px-[5px] py-px rounded-[3px] font-semibold bg-dt-green-dim text-dt-green font-mono">
                          {formatCost(group.cost)}
                        </span>
                      )}
                      <span className="text-[10px] px-[5px] py-px rounded-full font-semibold bg-dt-bg4 text-dt-text2">
                        {group.entries.length}
                      </span>
                    </div>
                  </div>
                );
              }

              // Entry row
              const { entry, depth } = item;
              const actionStyle = getActionBadgeStyle(entry.toolName);
              const isHighlighted = selectedAgent && entry.agentId === selectedAgent;
              const isExpanded = expandedEntries.has(entry.uuid);
              const hasMore = entry.rawMessage && entry.rawMessage !== entry.message;
              const displayMessage = isExpanded ? (entry.rawMessage || entry.message) : entry.message;
              const indent = depth * 20;
              const depthColor = getDepthColor(depth);

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
                    className={`flex items-start gap-2 py-0.5 pr-3 text-[11px] border-b border-dt-border/20 transition-colors duration-150 ${isHighlighted ? "bg-dt-bg2" : ""}`}
                    style={{ paddingLeft: 16 + indent }}
                  >
                    {/* Timeline line segment */}
                    <div className="flex flex-col items-center shrink-0 pt-0.5" style={{ width: 8 }}>
                      <span
                        className="w-px h-full min-h-[16px]"
                        style={{ background: depthColor, opacity: 0.3 }}
                      />
                    </div>

                    {/* Timestamp */}
                    <span className="font-mono text-dt-text3 text-[10px] shrink-0 w-[58px]">
                      {formatTime(entry.timestamp)}
                    </span>

                    {/* Action badge */}
                    {entry.toolName && (
                      <span
                        className="text-[10px] px-[5px] py-px rounded-[3px] whitespace-nowrap font-medium shrink-0"
                        style={{ border: `1px solid ${actionStyle.border}`, color: actionStyle.color, background: "transparent" }}
                      >
                        {actionStyle.label}
                      </span>
                    )}

                    {/* Message */}
                    <span
                      onClick={() => hasMore && toggleExpand(entry.uuid)}
                      className={`text-dt-text1 leading-[1.3] flex-1 min-w-0 ${
                        isExpanded
                          ? "whitespace-pre-wrap break-all"
                          : "truncate"
                      } ${hasMore ? "cursor-pointer" : "cursor-default"}`}
                    >
                      {highlightMessage(displayMessage)}
                      {hasMore && !isExpanded && (
                        <span className="text-[9px] text-dt-accent ml-1 opacity-70">{"\u25B6"}</span>
                      )}
                      {isExpanded && (
                        <span className="text-[9px] text-dt-accent ml-1 opacity-70">{"\u25BC"}</span>
                      )}
                    </span>
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
