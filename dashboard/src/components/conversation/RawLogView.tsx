import { useState, useCallback, useMemo, useEffect, useRef, memo } from "react";
import type { SessionEvent, AssistantEvent, ContentItem } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";

export interface RawLogViewProps {
  turns: TurnSnapshot[];
  allEvents: SessionEvent[];
  activeTurnIndex: number | null;
}

const TYPE_COLORS: Record<string, string> = {
  user: "var(--blu, #3b82f6)",
  assistant: "var(--pur, #a855f7)",
  system: "var(--t3)",
  progress: "var(--amb, #f59e0b)",
};

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return ts;
  }
}

function summarizeEvent(event: SessionEvent): string {
  if (event.type === "assistant") {
    const asst = event as AssistantEvent;
    const content = asst.message?.content;
    if (Array.isArray(content)) {
      const textItem = content.find(
        (c: ContentItem) => c.type === "text" && "text" in c,
      );
      if (textItem && "text" in textItem) {
        const text = textItem.text;
        return text.length > 120 ? text.slice(0, 120) + "..." : text;
      }
      const toolItem = content.find((c: ContentItem) => c.type === "tool_use");
      if (toolItem && "name" in toolItem) {
        return `tool_use: ${toolItem.name}`;
      }
    }
    return "assistant message";
  }
  if (event.type === "user") {
    return "user message";
  }
  if (event.type === "system") {
    return `system: ${(event as { subtype?: string }).subtype ?? ""}`;
  }
  if (event.type === "progress") {
    return "progress";
  }
  return event.type;
}

/** Syntax-highlight JSON string for display */
function highlightJson(json: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Simple regex-based highlighting
  const regex = /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(json)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(json.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Key (with colon)
      parts.push(
        <span key={match.index} style={{ color: "var(--acc, #60a5fa)" }}>
          {match[1]}
        </span>,
      );
    } else if (match[2]) {
      // String value
      parts.push(
        <span key={match.index} style={{ color: "var(--grn, #4ade80)" }}>
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // Boolean/null
      parts.push(
        <span key={match.index} style={{ color: "var(--red, #f87171)" }}>
          {match[3]}
        </span>,
      );
    } else if (match[4]) {
      // Number
      parts.push(
        <span key={match.index} style={{ color: "var(--amb, #f59e0b)" }}>
          {match[4]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < json.length) {
    parts.push(json.slice(lastIndex));
  }

  return parts;
}

function RawLogViewInner({ turns, allEvents, activeTurnIndex }: RawLogViewProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset expanded state and scroll to top when turn changes
  useEffect(() => {
    setExpandedRows(new Set());
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [activeTurnIndex]);

  const toggleRow = useCallback((uuid: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  const activeTurn = activeTurnIndex != null ? turns[activeTurnIndex] : null;

  const turnEvents = useMemo(() => {
    if (!activeTurn) return [];
    return getEventsForTurn(activeTurn, allEvents);
  }, [activeTurn, allEvents]);

  if (activeTurnIndex == null || !activeTurn) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text3 text-xs">
        Select a turn to view raw events
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}
    >
      {turnEvents.map((event) => {
        const isExpanded = expandedRows.has(event.uuid);
        const typeColor = TYPE_COLORS[event.type] ?? "var(--t3)";

        return (
          <div key={event.uuid} className="border-b border-dt-border">
            <button
              onClick={() => toggleRow(event.uuid)}
              className="w-full flex items-center gap-2 px-3 py-[5px] bg-transparent border-none cursor-pointer text-left hover:bg-dt-bg-hover"
              style={{ fontSize: 11 }}
            >
              <span
                className="text-dt-text3 select-none"
                style={{ fontSize: 9, width: 12, textAlign: "center" }}
              >
                {isExpanded ? "\u25BC" : "\u25B6"}
              </span>
              <span className="text-dt-text2 shrink-0">
                {formatTimestamp(event.timestamp)}
              </span>
              <span
                className="shrink-0 rounded px-[5px] py-[1px] text-[10px]"
                style={{
                  border: `1px solid ${typeColor}`,
                  color: typeColor,
                }}
              >
                {event.type}
              </span>
              <span className="text-dt-text3 truncate">
                {summarizeEvent(event)}
              </span>
            </button>
            {isExpanded && (
              <pre
                className="m-0 px-6 py-2 overflow-x-auto text-dt-text2 bg-dt-bg-subtle"
                style={{ fontSize: 10, lineHeight: 1.5 }}
              >
                {highlightJson(JSON.stringify(event, null, 2))}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const RawLogView = memo(RawLogViewInner);
