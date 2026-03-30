import { memo, useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { SessionEvent, AssistantEvent, ContentItem } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";

export interface RawLogTabProps {
  turns: TurnSnapshot[];
  allEvents: SessionEvent[];
  activeTurnIndex: number | null;
  events: SessionEvent[];
  liveEvents: SessionEvent[];
  isLive?: boolean;
}

const MAX_VISIBLE = 100;

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  user: { bg: "rgba(59,130,246,0.15)", color: "var(--blu, #3b82f6)" },
  assistant: { bg: "rgba(168,85,247,0.15)", color: "var(--pur, #a855f7)" },
  system: { bg: "rgba(156,163,175,0.15)", color: "var(--t3)" },
  progress: { bg: "rgba(245,158,11,0.15)", color: "var(--amb, #f59e0b)" },
};

function formatTimestampMs(ts: string): string {
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

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts.slice(11, 19);
  }
}

function truncate(text: string, max = 80): string {
  const clean = text.replace(/\n/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + "...";
}

function extractSummary(event: SessionEvent): string {
  if (event.type === "assistant") {
    const msg = (event as AssistantEvent).message;
    const content = msg.content;
    if (typeof content === "string") return truncate(content);
    if (Array.isArray(content)) {
      const textItem = content.find((c: ContentItem) => c.type === "text");
      if (textItem && "text" in textItem) return truncate(textItem.text);
      const toolItem = content.find((c: ContentItem) => c.type === "tool_use");
      if (toolItem && "name" in toolItem) return `[tool_use: ${toolItem.name}]`;
    }
    return "";
  }
  if (event.type === "user") {
    const msg = event.message;
    if (typeof msg.content === "string") return truncate(msg.content);
    if (Array.isArray(msg.content)) {
      const textItem = msg.content.find((c: ContentItem) => c.type === "text");
      if (textItem && "text" in textItem) return truncate(textItem.text);
      const resultItem = msg.content.find(
        (c: ContentItem) => c.type === "tool_result",
      );
      if (resultItem && "tool_use_id" in resultItem) return "[tool_result]";
    }
    return "";
  }
  if (event.type === "system") {
    return event.subtype || "";
  }
  if (event.type === "progress") {
    return event.data?.type || "";
  }
  return "";
}

function summarizeEvent(event: SessionEvent): string {
  const time = formatTimestamp(event.timestamp);
  const type = event.type;
  const json = JSON.stringify(event);
  const preview = json.length > 60 ? json.slice(0, 60) + "..." : json;
  return `${time}  ${type}  ${preview}`;
}

function highlightJson(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"([^"]+)":/g, '<span style="color:var(--acc)">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span style="color:var(--grn)">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color:var(--amb)">$1</span>')
    .replace(
      /: (true|false|null)/g,
      ': <span style="color:var(--red)">$1</span>',
    );
}

// ─── Events Mode ────────────────────────────────────────────────────

interface EventsModeProps {
  events: SessionEvent[];
  liveEvents: SessionEvent[];
}

function EventsMode({ events, liveEvents }: EventsModeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(
    () => new Set(),
  );

  const combined = useMemo(() => {
    const all = [...events, ...liveEvents];
    return all.length > MAX_VISIBLE ? all.slice(-MAX_VISIBLE) : all;
  }, [events, liveEvents]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [combined.length]);

  const toggleRow = useCallback((index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  if (combined.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "var(--t3)", fontSize: 13 }}>
          Waiting for events...
        </span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{ height: "100%", overflowY: "auto" }}>
      {combined.map((event, i) => {
        const colors = TYPE_COLORS[event.type] ?? TYPE_COLORS.system;
        const isExpanded = expandedRows.has(i);
        return (
          <div key={event.uuid ?? i}>
            <div
              data-testid="event-row"
              onClick={() => toggleRow(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                borderBottom: "1px solid var(--bd)",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 12,
                  flexShrink: 0,
                  color: "var(--t3)",
                  fontSize: 9,
                }}
              >
                {isExpanded ? "\u25bc" : "\u25b6"}
              </span>
              <span
                style={{
                  color: "var(--t3)",
                  width: 80,
                  flexShrink: 0,
                }}
              >
                {formatTimestampMs(event.timestamp)}
              </span>
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: "var(--radius)",
                  fontSize: 10,
                  background: colors.bg,
                  color: colors.color,
                  flexShrink: 0,
                }}
              >
                {event.type}
              </span>
              <span
                style={{
                  color: "var(--t2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {extractSummary(event)}
              </span>
            </div>
            {isExpanded && (
              <div className="row-expand" data-testid="row-json-expand">
                <div className="row-json">
                  <pre
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: highlightJson(
                        JSON.stringify(event, null, 2),
                      ),
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── JSON Mode ──────────────────────────────────────────────────────

interface JsonModeProps {
  turns: TurnSnapshot[];
  allEvents: SessionEvent[];
  activeTurnIndex: number | null;
}

function JsonMode({ turns, allEvents, activeTurnIndex }: JsonModeProps) {
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(
    null,
  );

  const activeTurn =
    activeTurnIndex !== null &&
    activeTurnIndex >= 0 &&
    activeTurnIndex < turns.length
      ? turns[activeTurnIndex]
      : undefined;

  const events = useMemo(
    () => (activeTurn ? getEventsForTurn(activeTurn, allEvents) : []),
    [activeTurn, allEvents],
  );

  const handleClick = useCallback((index: number) => {
    setSelectedEventIndex((prev) => (prev === index ? null : index));
  }, []);

  const highlightedJson = useMemo(() => {
    if (selectedEventIndex === null || selectedEventIndex >= events.length)
      return null;
    const raw = JSON.stringify(events[selectedEventIndex], null, 2);
    return highlightJson(raw);
  }, [events, selectedEventIndex]);

  if (!activeTurn) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100%", color: "var(--t3)", fontSize: 13 }}
      >
        Select a turn to see raw events
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          overflowY: "auto",
          flex: selectedEventIndex !== null ? "0 0 auto" : "1",
          maxHeight: selectedEventIndex !== null ? "40%" : "100%",
        }}
      >
        {events.map((event, i) => (
          <div
            key={event.uuid ?? i}
            data-testid="raw-event-row"
            onClick={() => handleClick(i)}
            style={{
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: selectedEventIndex === i ? "var(--bg-s)" : undefined,
              borderLeft:
                selectedEventIndex === i
                  ? "2px solid var(--acc)"
                  : "2px solid transparent",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--t2)",
            }}
          >
            {summarizeEvent(event)}
          </div>
        ))}
      </div>
      {highlightedJson !== null && (
        <div
          data-testid="raw-json-view"
          style={{
            flex: 1,
            padding: 12,
            background: "var(--bg-s)",
            overflow: "auto",
            borderTop: "1px solid var(--bd)",
          }}
        >
          <pre
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
            dangerouslySetInnerHTML={{ __html: highlightedJson }}
          />
        </div>
      )}
    </div>
  );
}

// ─── RawLogTab ──────────────────────────────────────────────────────

function RawLogTabInner({
  turns,
  allEvents,
  activeTurnIndex,
  events,
  liveEvents,
  isLive,
}: RawLogTabProps) {
  const [mode, setMode] = useState<"events" | "json">("events");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="rawlog-header">
        <div className="rawlog-toggle">
          <button
            className={`rawlog-btn ${mode === "events" ? "active" : ""}`}
            onClick={() => setMode("events")}
          >
            Events{isLive ? " \u25cf" : ""}
          </button>
          <button
            className={`rawlog-btn ${mode === "json" ? "active" : ""}`}
            onClick={() => setMode("json")}
          >
            JSON
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "events" ? (
          <EventsMode events={events} liveEvents={liveEvents} />
        ) : (
          <JsonMode
            turns={turns}
            allEvents={allEvents}
            activeTurnIndex={activeTurnIndex}
          />
        )}
      </div>
    </div>
  );
}

export const RawLogTab = memo(RawLogTabInner);
