import { memo, useEffect, useRef, useMemo } from "react";
import type { SessionEvent, AssistantEvent, ContentItem } from "../../lib/types";

export interface LiveTabProps {
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
      const resultItem = msg.content.find((c: ContentItem) => c.type === "tool_result");
      if (resultItem && "tool_use_id" in resultItem) return `[tool_result]`;
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

function truncate(text: string, max = 80): string {
  const clean = text.replace(/\n/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + "...";
}

function LiveTabInner({ events, liveEvents }: LiveTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const combined = useMemo(() => {
    const all = [...events, ...liveEvents];
    return all.length > MAX_VISIBLE ? all.slice(-MAX_VISIBLE) : all;
  }, [events, liveEvents]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [combined.length]);

  if (combined.length === 0) {
    return (
      <div
        style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <span style={{ color: "var(--t3)", fontSize: 13 }}>Waiting for events...</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{ height: "100%", overflowY: "auto" }}>
      {combined.map((event, i) => {
        const colors = TYPE_COLORS[event.type] ?? TYPE_COLORS.system;
        return (
          <div
            key={event.uuid ?? i}
            data-testid="event-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              borderBottom: "1px solid var(--bd)",
            }}
          >
            <span
              style={{
                color: "var(--t3)",
                width: 80,
                flexShrink: 0,
              }}
            >
              {formatTimestamp(event.timestamp)}
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
        );
      })}
    </div>
  );
}

export const LiveTab = memo(LiveTabInner);
