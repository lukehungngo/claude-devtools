import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import type { SessionEvent, SessionMetrics } from "../../lib/types";
import { groupEventsIntoTurns } from "../../lib/turnSnapshot";
import { CostStrip } from "../viewer/CostStrip";
import { PromptInput } from "./PromptInput";
import { TurnCard } from "./TurnCard";

interface ConversationViewProps {
  events: SessionEvent[];
  metrics: SessionMetrics | null;
  isLive?: boolean;
  sessionCwd?: string;
  sessionId?: string;
  highlightedTurnIndex?: number;
  onAgentPillClick?: (agentId: string) => void;
}

export function ConversationView({
  events,
  metrics,
  isLive,
  sessionCwd,
  sessionId,
  highlightedTurnIndex,
  onAgentPillClick,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const turns = useMemo(() => groupEventsIntoTurns(events), [events]);

  // Auto-scroll when new turns arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [turns.length, autoScroll]);

  // Scroll to highlighted turn
  useEffect(() => {
    if (highlightedTurnIndex != null && scrollRef.current) {
      const turnElements = scrollRef.current.querySelectorAll(".conv-turn");
      const target = turnElements[highlightedTurnIndex];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightedTurnIndex]);

  // Detect user scroll to toggle auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
    setShowScrollDown(!atBottom);
  }, []);

  // Handle Ctrl+F to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        // Focus search input on next frame
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  // Filter turns by search query
  const filteredTurns = useMemo(() => {
    if (!searchQuery.trim()) return turns;
    const q = searchQuery.toLowerCase();
    return turns.filter((turn) => {
      // Search in prompt text
      if (turn.promptText.toLowerCase().includes(q)) return true;
      // Search in event content
      for (const event of turn.events) {
        if (event.type === "assistant" || event.type === "user") {
          const msg = (event as { message?: { content?: unknown } }).message;
          const contentStr = typeof msg?.content === "string"
            ? msg.content
            : JSON.stringify(msg?.content || "");
          if (contentStr.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
  }, [turns, searchQuery]);

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
            <path d="M1.5 2.75C1.5 1.784 2.284 1 3.25 1h9.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0112.75 13H8.061l-2.574 2.573A1.458 1.458 0 013 14.543V13H3.25A1.75 1.75 0 011.5 11.25v-8.5z" />
          </svg>
          Conversation
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
          <span
            style={{
              fontSize: "10px",
              color: "var(--text-2)",
            }}
          >
            {turns.length} turn{turns.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Search bar (Ctrl+F) */}
      {showSearch && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search turns..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-0)",
              fontFamily: "var(--font)",
              fontSize: "11px",
            }}
          />
          <span style={{ fontSize: "10px", color: "var(--text-2)", flexShrink: 0 }}>
            {filteredTurns.length}/{turns.length}
          </span>
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(""); }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-2)",
              cursor: "pointer",
              fontSize: "14px",
              padding: "0 2px",
            }}
          >
            {"×"}
          </button>
        </div>
      )}

      {/* Turn list (scrollable) */}
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
        {filteredTurns.length === 0 ? (
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
          filteredTurns.map((turn) => (
            <TurnCard
              key={turn.turnNumber}
              turn={turn}
              isHighlighted={highlightedTurnIndex === turns.indexOf(turn)}
              onAgentPillClick={onAgentPillClick}
            />
          ))
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
            {"\u2193"} New turns
          </button>
        </div>
      )}

      {/* Cost strip */}
      <CostStrip metrics={metrics} />

      {/* Command input */}
      <PromptInput sessionCwd={sessionCwd} sessionId={sessionId} />
    </div>
  );
}
