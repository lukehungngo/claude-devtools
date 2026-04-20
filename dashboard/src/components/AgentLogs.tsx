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
import { formatCost, formatDuration, formatTokens, calculateTurnCost } from "../lib/cost";
import { buildExportPayload, downloadJson } from "../lib/exportAgentLog";
import { formatModelName } from "../lib/formatModelName";

// ─── Types ───────────────────────────────────────────────────────────

export interface LogEntry {
  uuid: string;
  timestamp: string;
  agentId: string;
  agentType: string;
  model?: string;
  message: string;
  /** Full untruncated message for expand view */
  rawMessage?: string;
  toolName: string | null;
  isError: boolean;
  /** Estimated cost for this log entry (from assistant events) */
  cost: number;
  tokensIn: number;
  tokensOut: number;
}

export interface TimelineGroup {
  agentId: string;
  agentType: string;
  model?: string;
  depth: number;
  entries: LogEntry[];
  startTime: string;
  endTime: string;
  durationMs: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
}

type FlatItem =
  | { kind: "agent-header"; group: TimelineGroup; groupIndex: number }
  | { kind: "entry"; entry: LogEntry; depth: number; groupIndex: number; entryIndex: number };

// ─── Action badge colors ─────────────────────────────────────────────

export function getActionBadgeStyle(toolName: string | null): {
  bg: string;
  color: string;
  border?: string;
  label: string;
} | null {
  if (!toolName) return null;

  const name = toolName.toLowerCase();
  if (name === "thinking" || name === "think") {
    return { bg: "var(--resp-think-bg)", color: "var(--resp-think)", label: "think" };
  }
  if (name === "read" || name === "grep" || name === "glob") {
    return { bg: "var(--resp-tool-bg)", color: "var(--resp-tool)", label: toolName };
  }
  if (name === "write" || name === "edit") {
    return { bg: "var(--grn-bg)", color: "var(--grn)", label: toolName };
  }
  if (name === "bash") {
    return { bg: "var(--resp-tool-bg)", color: "var(--resp-tool)", label: "Bash" };
  }
  if (name === "error") {
    return { bg: "var(--red-bg)", color: "var(--red)", label: "error" };
  }
  if (name === "result") {
    return { bg: "var(--bg-s)", color: "var(--t2)", border: "1px solid var(--bd)", label: "result" };
  }
  if (name === "spawn" || name === "completed" || name === "agent") {
    return { bg: "var(--resp-dispatch-bg)", color: "var(--resp-dispatch)", label: toolName };
  }
  // Unknown tool — purple (tool category)
  return {
    bg: "var(--resp-tool-bg)",
    color: "var(--resp-tool)",
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
      let isFirstEntry = true;
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
            model: model || undefined,
            message: info.message,
            rawMessage: info.rawMessage,
            toolName: info.toolName || null,
            isError: content.type === "tool_result" && !!content.is_error,
            cost: costPerItem,
            tokensIn: isFirstEntry ? (usage?.input_tokens ?? 0) : 0,
            tokensOut: isFirstEntry ? (usage?.output_tokens ?? 0) : 0,
          });
          isFirstEntry = false;
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
            tokensIn: 0,
            tokensOut: 0,
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
            tokensIn: 0,
            tokensOut: 0,
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
        tokensIn: 0,
        tokensOut: 0,
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

export function buildTimelineGroups(
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
        model: entry.model,
        depth: depthMap.get(entry.agentId) ?? (entry.agentId === "main" ? 0 : 1),
        entries: [entry],
        startTime: entry.timestamp,
        endTime: entry.timestamp,
        durationMs: 0,
        cost: entry.cost,
        tokensIn: entry.tokensIn,
        tokensOut: entry.tokensOut,
      };
      groups.push(current);
    } else {
      current.entries.push(entry);
      current.endTime = entry.timestamp;
      current.cost += entry.cost;
      current.tokensIn += entry.tokensIn;
      current.tokensOut += entry.tokensOut;
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
    <div className="flex flex-col h-full min-h-0">
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
            className="h-6 px-2 flex items-center gap-1 rounded-dt-sm text-[11px] font-medium text-dt-text2 cursor-pointer border border-dt-border bg-dt-bg2 hover:bg-dt-bg3 transition-all duration-150"
            title="Export agent log as JSON"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M3 14h10" />
            </svg>
            Export
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
        className="flex-1 overflow-y-auto overflow-x-auto p-0 relative dt-scrollbar"
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
              minWidth: "100%",
              width: "max-content",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              if (!item) return null;

              if (item.kind === "agent-header") {
                const { group, groupIndex } = item;
                const isCollapsed = collapsedGroups.has(groupIndex);
                const indentPx = 18 + group.depth * 20;
                // Main agent (depth 0) uses dispatch/terracotta, subagents use tool/purple
                const nameColor = group.depth === 0 ? "var(--resp-dispatch)" : "var(--resp-tool)";

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      minWidth: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      data-testid="agent-group-header"
                      onClick={() => {
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(groupIndex)) next.delete(groupIndex);
                          else next.add(groupIndex);
                          return next;
                        });
                      }}
                      className="flex items-center gap-2 border-b border-dt-border cursor-pointer select-none"
                      style={{
                        background: "var(--bg-s)",
                        paddingLeft: indentPx,
                        paddingRight: 18,
                        paddingTop: 8,
                        paddingBottom: 8,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        lineHeight: "17px",
                      }}
                    >
                      {/* Chevron */}
                      <span
                        aria-hidden="true"
                        className="shrink-0 transition-transform duration-[120ms]"
                        style={{
                          color: "var(--t3)",
                          fontSize: 9,
                          transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          display: "inline-block",
                        }}
                      >
                        ▾
                      </span>

                      {/* Agent name — clickable, selects agent in DAG */}
                      <span
                        className="font-semibold shrink-0 cursor-pointer"
                        style={{ color: nameColor }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAgent(group.agentId);
                        }}
                      >
                        {normalizeAgentTypeLabel(group.agentType)}
                      </span>

                      {/* Model badge */}
                      {group.model && (
                        <span
                          data-testid="agent-header-model-badge"
                          className="shrink-0"
                          style={{ color: "var(--t3)", fontSize: 10 }}
                        >
                          {formatModelName(group.model)}
                        </span>
                      )}

                      {/* Time range + duration */}
                      <span className="shrink-0" style={{ color: "var(--t3)", fontSize: 10, marginLeft: 6 }}>
                        {formatTime(group.startTime)}
                        {group.durationMs > 0 && ` \u2014 ${formatTime(group.endTime)}`}
                        {group.durationMs > 0 && ` (${formatDuration(group.durationMs)})`}
                      </span>

                      {/* Spacer */}
                      <span className="flex-1" />

                      {/* Cost (amber) */}
                      {group.cost > 0 && (
                        <span
                          className="font-semibold shrink-0"
                          style={{ color: "var(--amb)", fontSize: 10 }}
                        >
                          {formatCost(group.cost)}
                        </span>
                      )}

                      {/* Token count */}
                      {(group.tokensIn > 0 || group.tokensOut > 0) && (
                        <span className="shrink-0" style={{ color: "var(--t2)", fontSize: 10 }}>
                          {formatTokens(group.tokensIn)}/{formatTokens(group.tokensOut)}
                        </span>
                      )}

                      {/* Entry count pill */}
                      <span
                        className="rounded-full px-[5px] py-px shrink-0"
                        style={{
                          background: "var(--bg-e)",
                          border: "1px solid var(--bd)",
                          color: "var(--t2)",
                          fontSize: 9,
                          fontWeight: 600,
                        }}
                      >
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
              const indentPx = 18 + depth * 20;

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
                    className={`grid border-b border-dt-border/15 transition-colors duration-[120ms] ${
                      isHighlighted ? "bg-[var(--bg-sel)]" : "hover:bg-[var(--bg-s)]"
                    }`}
                    style={{
                      gridTemplateColumns: "70px 1fr",
                      paddingLeft: indentPx,
                      paddingRight: 18,
                      paddingTop: 3,
                      paddingBottom: 3,
                      gap: "12px",
                    }}
                  >
                    {/* Timestamp */}
                    <span className="font-mono text-sm text-dt-text2 leading-[17px] shrink-0 tabular-nums">
                      {formatTime(entry.timestamp)}
                    </span>

                    {/* Content: tag + message */}
                    <span
                      className={`font-mono text-base text-dt-text0 leading-[17px] min-w-0 ${
                        isExpanded ? "whitespace-pre-wrap break-all" : "whitespace-nowrap overflow-hidden text-ellipsis"
                      } ${hasMore ? "cursor-pointer" : ""}`}
                      onClick={() => hasMore && toggleExpand(entry.uuid)}
                    >
                      {actionStyle && (
                        <span
                          className="inline-block text-[9px] font-bold uppercase tracking-[0.4px] px-[5px] py-px rounded-[3px] mr-1.5 align-middle"
                          style={{
                            background: actionStyle.bg,
                            color: actionStyle.color,
                            ...(actionStyle.border ? { border: actionStyle.border } : {}),
                          }}
                        >
                          {actionStyle.label}
                        </span>
                      )}
                      {highlightMessage(displayMessage)}
                      {hasMore && !isExpanded && (
                        <span className="text-[9px] text-dt-accent ml-1 opacity-60">{"\u25B6"}</span>
                      )}
                      {isExpanded && (
                        <span className="text-[9px] text-dt-accent ml-1 opacity-60">{"\u25BC"}</span>
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
