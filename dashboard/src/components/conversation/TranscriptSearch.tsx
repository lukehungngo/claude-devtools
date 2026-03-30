import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { SessionEvent } from "../../lib/types";

interface SearchMatch {
  eventIndex: number;
  text: string;
}

interface TranscriptSearchProps {
  events: SessionEvent[];
  visible: boolean;
  onClose: () => void;
  onNavigate?: (eventIndex: number) => void;
}

function extractTextFromEvent(event: SessionEvent): string {
  if (event.type === "assistant") {
    const msg = event.message;
    if (!msg?.content) return "";
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((block: { type: string; text?: string; input?: unknown; thinking?: string }) => {
          if (block.type === "text") return block.text || "";
          if (block.type === "tool_use") return JSON.stringify(block.input || "");
          if (block.type === "thinking") return block.thinking || "";
          return "";
        })
        .join(" ");
    }
    return "";
  }
  if (event.type === "user") {
    const msg = event.message;
    if (!msg?.content) return "";
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((block: { type: string; text?: string; content?: unknown; output?: string }) => {
          if (block.type === "text") return block.text || "";
          if (block.type === "tool_result") return typeof block.content === "string" ? block.content : JSON.stringify(block.content || "");
          return "";
        })
        .join(" ");
    }
    return "";
  }
  if (event.type === "system") {
    return event.subtype || "";
  }
  return "";
}

export const TranscriptSearch = React.memo(function TranscriptSearch({
  events,
  visible,
  onClose,
  onNavigate,
}: TranscriptSearchProps) {
  const [query, setQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Focus input when visible
  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Build search index
  const matches: SearchMatch[] = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return [];
    const lower = debouncedQuery.toLowerCase();
    const results: SearchMatch[] = [];
    for (let i = 0; i < events.length; i++) {
      const text = extractTextFromEvent(events[i]);
      if (text.toLowerCase().includes(lower)) {
        const idx = text.toLowerCase().indexOf(lower);
        const start = Math.max(0, idx - 30);
        const end = Math.min(text.length, idx + debouncedQuery.length + 30);
        results.push({ eventIndex: i, text: (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "") });
      }
    }
    return results;
  }, [events, debouncedQuery]);

  // Reset current match when matches change
  useEffect(() => {
    setCurrentMatch(0);
  }, [matches.length]);

  const goToMatch = useCallback((index: number) => {
    if (matches.length === 0) return;
    const wrapped = ((index % matches.length) + matches.length) % matches.length;
    setCurrentMatch(wrapped);
    onNavigate?.(matches[wrapped].eventIndex);
  }, [matches, onNavigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      goToMatch(e.shiftKey ? currentMatch - 1 : currentMatch + 1);
    }
  }, [onClose, goToMatch, currentMatch]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-dt-bg2 border-b border-dt-border/50">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search transcript..."
        className="flex-1 bg-dt-bg3 border border-dt-border/50 rounded px-3 py-1.5 text-sm text-dt-text0 placeholder-dt-text3 focus:outline-none focus:border-dt-accent/50"
      />
      <span className="text-xs text-dt-text2 min-w-[60px] text-center">
        {matches.length > 0 ? `${currentMatch + 1} of ${matches.length}` : query.length >= 2 ? "No matches" : ""}
      </span>
      <button
        onClick={() => goToMatch(currentMatch - 1)}
        disabled={matches.length === 0}
        className="px-2 py-1 text-xs rounded bg-dt-bg3 text-dt-text1 hover:bg-dt-bg4 disabled:opacity-30 border border-dt-border/30"
        title="Previous (Shift+Enter)"
      >
        ↑
      </button>
      <button
        onClick={() => goToMatch(currentMatch + 1)}
        disabled={matches.length === 0}
        className="px-2 py-1 text-xs rounded bg-dt-bg3 text-dt-text1 hover:bg-dt-bg4 disabled:opacity-30 border border-dt-border/30"
        title="Next (Enter)"
      >
        ↓
      </button>
      <button
        onClick={onClose}
        className="px-2 py-1 text-xs rounded bg-dt-bg3 text-dt-text1 hover:bg-dt-bg4 border border-dt-border/30"
        title="Close (Esc)"
      >
        ✕
      </button>
    </div>
  );
});
