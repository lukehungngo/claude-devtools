import { useRef, useState, useEffect, useCallback } from "react";
import type { SessionEvent, SessionMetrics } from "../../lib/types";
import { EventStream } from "./EventStream";
import { CostStrip } from "./CostStrip";
import { CommandDispatch } from "./CommandDispatch";

interface SessionViewerProps {
  events: SessionEvent[];
  metrics: SessionMetrics | null;
  isLive?: boolean;
  sessionCwd?: string;
}

export function SessionViewer({
  events,
  metrics,
  isLive,
  sessionCwd,
}: SessionViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Auto-scroll when new events arrive and autoScroll is enabled
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, autoScroll]);

  // Detect user scroll to toggle auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
    setShowScrollDown(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
      setShowScrollDown(false);
    }
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-1)",
        overflow: "hidden",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: "32px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-2)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "12px",
            fontWeight: 600,
            fontFamily: "var(--font-sans)",
            color: "var(--text-0)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ opacity: 0.7 }}
          >
            <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z" />
            <path d="M7 11a1 1 0 100-2H4a1 1 0 100 2h3zm4.75-3.5L9 5.25v3.5l2.75-2.25z" />
          </svg>
          Claude CLI
          {isLive && (
            <span
              style={{
                fontSize: "9px",
                fontWeight: 600,
                color: "var(--green)",
                background: "var(--green-dim)",
                padding: "1px 6px",
                borderRadius: "3px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              live
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {metrics?.permissionMode && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-2)",
                padding: "3px 8px",
                borderRadius: "3px",
                background: "var(--bg-3)",
              }}
            >
              {metrics.permissionMode}
            </span>
          )}
        </div>
      </div>

      {/* Event stream (scrollable) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          position: "relative",
        }}
      >
        {events.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-2)",
              fontSize: "12px",
            }}
          >
            No events to display
          </div>
        ) : (
          <EventStream events={events} />
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollDown && (
        <div
          style={{
            position: "absolute",
            bottom: "120px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <button
            onClick={scrollToBottom}
            style={{
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--text-1)",
              padding: "4px 12px",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            {"\u2193"} New events
          </button>
        </div>
      )}

      {/* Cost strip */}
      <CostStrip metrics={metrics} />

      {/* Command input */}
      <CommandDispatch sessionCwd={sessionCwd} />
    </div>
  );
}
