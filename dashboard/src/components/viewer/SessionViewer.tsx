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
  sessionId?: string;
}

export function SessionViewer({
  events,
  metrics,
  isLive,
  sessionCwd,
  sessionId,
}: SessionViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Auto-scroll when new events arrive and autoScroll is enabled
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
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
    <div className="flex flex-col h-full bg-dt-bg1 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-dt-border bg-dt-bg2 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold font-sans text-dt-text0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="opacity-70"
          >
            <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z" />
            <path d="M7 11a1 1 0 100-2H4a1 1 0 100 2h3zm4.75-3.5L9 5.25v3.5l2.75-2.25z" />
          </svg>
          Claude CLI
          {isLive && (
            <span className="text-xs font-semibold text-dt-green bg-dt-green-dim px-1.5 py-px rounded-dt-xs uppercase tracking-[0.5px]">
              live
            </span>
          )}
        </div>
        <div className="flex gap-1 items-center">
          {metrics?.permissionMode && (
            <span className="text-xxs text-dt-text2 px-2 py-0.75 rounded-dt-xs bg-dt-bg3">
              {metrics.permissionMode}
            </span>
          )}
        </div>
      </div>

      {/* Event stream (scrollable) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 relative dt-scrollbar"
      >
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
            No events to display
          </div>
        ) : (
          <EventStream events={events} />
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollDown && (
        <div className="absolute bottom-30 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="bg-dt-bg3 border border-dt-border rounded-dt text-dt-text1 px-3 py-1 text-sm cursor-pointer flex items-center gap-1 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          >
            {"\u2193"} New events
          </button>
        </div>
      )}

      {/* Cost strip */}
      <CostStrip metrics={metrics} />

      {/* Command input */}
      <CommandDispatch sessionCwd={sessionCwd} sessionId={sessionId} />
    </div>
  );
}
