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
    <div className="flex flex-col h-full bg-dt-bg1 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-dt-border bg-dt-bg2 shrink-0">
        <div className="flex items-center gap-2 text-base font-semibold font-sans text-dt-text0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="opacity-70"
          >
            <path d="M1.5 2.75C1.5 1.784 2.284 1 3.25 1h9.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0112.75 13H8.061l-2.574 2.573A1.458 1.458 0 013 14.543V13H3.25A1.75 1.75 0 011.5 11.25v-8.5z" />
          </svg>
          Conversation
          {isLive && (
            <span className="text-2xs font-semibold text-dt-green bg-dt-green-dim px-1.5 py-px rounded-dt-xs uppercase tracking-[0.5px]">
              live
            </span>
          )}
        </div>
        <div className="flex gap-1 items-center">
          {metrics?.permissionMode && (
            <span className="text-sm text-dt-text2 px-2 py-0.75 rounded-dt-xs bg-dt-bg3">
              {metrics.permissionMode}
            </span>
          )}
          <span className="text-sm text-dt-text2">
            {turns.length} turn{turns.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Search bar (Ctrl+F) */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-dt-bg2 border-b border-dt-border shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50 shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search turns..."
            className="flex-1 bg-transparent border-none outline-none text-dt-text0 font-mono text-base"
          />
          <span className="text-sm text-dt-text2 shrink-0">
            {filteredTurns.length}/{turns.length}
          </span>
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(""); }}
            className="bg-none border-none text-dt-text2 cursor-pointer text-md px-0.5"
          >
            {"×"}
          </button>
        </div>
      )}

      {/* Turn list (scrollable) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 relative dt-scrollbar"
      >
        {filteredTurns.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dt-text2 text-base">
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
          className="absolute bottom-30 left-1/2 -translate-x-1/2 z-10"
        >
          <button
            onClick={scrollToBottom}
            className="bg-dt-bg3 border border-dt-border rounded-dt text-dt-text1 px-3 py-1 text-sm cursor-pointer flex items-center gap-1 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
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
