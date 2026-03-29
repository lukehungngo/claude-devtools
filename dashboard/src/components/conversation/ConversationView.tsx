import { useRef, useState, useEffect, useCallback, useMemo, useContext } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SessionEvent, SessionMetrics, PermissionRequest, AssistantEvent } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { LayoutContext } from "../../contexts/LayoutContext";
import { normalizeContent } from "../../lib/normalizeContent";
import { buildSearchIndex, updateSearchIndex, filterTurnsByQuery } from "../../lib/searchIndex";
import { CostStrip } from "../viewer/CostStrip";
import { PermissionBlock } from "./PermissionBlock";
import { PermissionModeBadge, cyclePermissionMode } from "./PermissionModeBadge";
import type { PermissionMode } from "./permissionModeTypes";
import { QuestionBlock } from "./QuestionBlock";
import { PromptInput } from "./PromptInput";
import { ContextWarningBanner } from "./ContextWarningBanner";
import { MemoTurnCard } from "./TurnCard";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useStreamingState } from "../../hooks/useStreamingState";
import { StreamingTurnArea } from "./StreamingTurnArea";
import { ThemePicker } from "../ThemePicker";

export interface QuestionItem {
  questionId: string;
  questionText: string;
  status: "pending" | "answered";
  answer?: string;
  timestamp?: string;
}

interface ConversationViewProps {
  events: SessionEvent[];
  turns: TurnSnapshot[];
  metrics: SessionMetrics | null;
  isLive?: boolean;
  sessionCwd?: string;
  sessionId?: string;
  projectHash?: string;
  activeSessionId?: string;
  highlightedTurnIndex?: number;
  onAgentPillClick?: (agentId: string) => void;
  onTurnClick?: (turnIndex: number) => void;
  /** Pending/resolved permission requests to render inline in conversation */
  permissions?: PermissionRequest[];
  onPermissionDecide?: (id: string, decision: "approved" | "denied") => void;
  /** Called when user clicks "Allow for session" on a permission block */
  onDecideSession?: (id: string) => void;
  /** Pending/answered questions from the agent */
  questions?: QuestionItem[];
  onSubmitAnswer?: (questionId: string, answer: string) => void;
  /** Called when PromptInput auto-starts or resumes a session */
  onSessionStarted?: (sessionId: string) => void;
  /** Called when slash commands (/doctor, /stats, /mcp) request a panel */
  onOpenPanel?: (panel: "doctor" | "stats" | "mcp") => void;
}

// ─── Virtualized turn list ──────────────────────────────────────────

interface VirtualizedTurnListProps {
  scrollRef: React.RefObject<HTMLDivElement>;
  handleScroll: () => void;
  filteredTurns: TurnSnapshot[];
  turns: TurnSnapshot[];
  autoScroll: boolean;
  highlightedTurnIndex?: number;
  onAgentPillClick?: (agentId: string) => void;
  onTurnClick?: (turnIndex: number) => void;
  permissions?: PermissionRequest[];
  onPermissionDecide?: (id: string, decision: "approved" | "denied") => void;
  onDecideSession?: (id: string) => void;
  questions?: QuestionItem[];
  onSubmitAnswer?: (questionId: string, answer: string) => void;
  streamingState: import("../../lib/streaming-types").StreamingState;
}

/** Render a single turn with its permissions and questions */
function TurnRow({
  turn,
  filteredIndex,
  filteredTurns,
  turns,
  highlightedTurnIndex,
  onAgentPillClick,
  onTurnClick,
  permissions,
  onPermissionDecide,
  onDecideSession,
  questions,
  onSubmitAnswer,
}: {
  turn: TurnSnapshot;
  filteredIndex: number;
  filteredTurns: TurnSnapshot[];
  turns: TurnSnapshot[];
  highlightedTurnIndex?: number;
  onAgentPillClick?: (agentId: string) => void;
  onTurnClick?: (turnIndex: number) => void;
  permissions?: PermissionRequest[];
  onPermissionDecide?: (id: string, decision: "approved" | "denied") => void;
  onDecideSession?: (id: string) => void;
  questions?: QuestionItem[];
  onSubmitAnswer?: (questionId: string, answer: string) => void;
}) {
  const unfilteredIndex = turns.indexOf(turn);
  const nextTurn = filteredTurns[filteredIndex + 1];
  const nextTurnStart = nextTurn?.startTime;

  const turnPerms = permissions && onPermissionDecide
    ? permissions.filter((p) => {
        const pt = p.timestamp;
        if (!pt) return false;
        return pt >= turn.startTime && (!nextTurnStart || pt < nextTurnStart);
      })
    : [];

  const turnQuestions = questions && onSubmitAnswer
    ? questions.filter((q) => {
        const qt = q.timestamp;
        if (!qt) return false;
        return qt >= turn.startTime && (!nextTurnStart || qt < nextTurnStart);
      })
    : [];

  return (
    <>
      <MemoTurnCard
        turn={turn}
        isHighlighted={highlightedTurnIndex === unfilteredIndex}
        onAgentPillClick={onAgentPillClick}
        onTurnClick={onTurnClick ? () => onTurnClick(unfilteredIndex) : undefined}
      />
      {turnPerms.map((perm) => (
        <PermissionBlock
          key={perm.id}
          permission={perm}
          onDecide={onPermissionDecide!}
          onDecideSession={onDecideSession}
        />
      ))}
      {turnQuestions.map((q) => (
        <QuestionBlock
          key={q.questionId}
          questionId={q.questionId}
          questionText={q.questionText}
          status={q.status}
          answer={q.answer}
          onSubmitAnswer={onSubmitAnswer!}
        />
      ))}
    </>
  );
}

function VirtualizedTurnList({
  scrollRef,
  handleScroll,
  filteredTurns,
  turns,
  autoScroll,
  highlightedTurnIndex,
  onAgentPillClick,
  onTurnClick,
  permissions,
  onPermissionDecide,
  onDecideSession,
  questions,
  onSubmitAnswer,
  streamingState,
}: VirtualizedTurnListProps) {
  const virtualizer = useVirtualizer({
    count: filteredTurns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  // Auto-scroll to bottom when new turns arrive
  useEffect(() => {
    if (autoScroll && filteredTurns.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(filteredTurns.length - 1, { align: "end" });
      });
    }
  }, [filteredTurns.length, autoScroll]); // eslint-disable-line react-hooks/exhaustive-deps

  const virtualItems = virtualizer.getVirtualItems();
  // Fallback: when virtualizer returns no items but we have turns (e.g., jsdom with 0-height container),
  // render all turns directly without virtualization positioning.
  const useVirtualLayout = virtualItems.length > 0 || filteredTurns.length === 0;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 relative dt-scrollbar"
    >
      {filteredTurns.length === 0 ? (
        <div className="flex items-center justify-center h-full text-dt-text2 text-base">
          No events to display
        </div>
      ) : useVirtualLayout ? (
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}
        >
          {virtualItems.map((virtualItem) => {
            const turn = filteredTurns[virtualItem.index];
            return (
              <div
                key={turn.turnNumber}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TurnRow
                  turn={turn}
                  filteredIndex={virtualItem.index}
                  filteredTurns={filteredTurns}
                  turns={turns}
                  highlightedTurnIndex={highlightedTurnIndex}
                  onAgentPillClick={onAgentPillClick}
                  onTurnClick={onTurnClick}
                  permissions={permissions}
                  onPermissionDecide={onPermissionDecide}
                  onDecideSession={onDecideSession}
                  questions={questions}
                  onSubmitAnswer={onSubmitAnswer}
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* Non-virtualized fallback (jsdom / SSR / 0-height container) */
        filteredTurns.map((turn, filteredIndex) => (
          <div key={turn.turnNumber}>
            <TurnRow
              turn={turn}
              filteredIndex={filteredIndex}
              filteredTurns={filteredTurns}
              turns={turns}
              highlightedTurnIndex={highlightedTurnIndex}
              onAgentPillClick={onAgentPillClick}
              onTurnClick={onTurnClick}
              permissions={permissions}
              onPermissionDecide={onPermissionDecide}
              onDecideSession={onDecideSession}
              questions={questions}
              onSubmitAnswer={onSubmitAnswer}
            />
          </div>
        ))
      )}

      {/* Permissions/questions without timestamps or before any turn -- fallback */}
      {permissions && onPermissionDecide && permissions
        .filter((p) => !p.timestamp || (filteredTurns.length > 0 && p.timestamp < filteredTurns[0].startTime))
        .map((perm) => (
          <PermissionBlock
            key={`fallback-${perm.id}`}
            permission={perm}
            onDecide={onPermissionDecide}
            onDecideSession={onDecideSession}
          />
        ))}
      {questions && onSubmitAnswer && questions
        .filter((q) => !q.timestamp || (filteredTurns.length > 0 && q.timestamp < filteredTurns[0].startTime))
        .map((q) => (
          <QuestionBlock
            key={`fallback-${q.questionId}`}
            questionId={q.questionId}
            questionText={q.questionText}
            status={q.status}
            answer={q.answer}
            onSubmitAnswer={onSubmitAnswer}
          />
        ))}
      {/* Streaming turn area (visible during active SSE) */}
      <StreamingTurnArea state={streamingState} />
    </div>
  );
}

// ─── ConversationView ───────────────────────────────────────────────

export function ConversationView({
  events,
  turns,
  metrics,
  isLive,
  sessionCwd,
  sessionId,
  projectHash,
  activeSessionId,
  highlightedTurnIndex,
  onAgentPillClick,
  onTurnClick,
  permissions,
  onPermissionDecide,
  onDecideSession,
  questions,
  onSubmitAnswer,
  onSessionStarted,
  onOpenPanel,
}: ConversationViewProps) {
  const layoutCtx = useContext(LayoutContext);
  const usage = layoutCtx?.usage ?? null;
  const costs = layoutCtx?.costs ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    (metrics?.permissionMode as PermissionMode) || "default"
  );

  const { state: streamingState, actions: streamingActions } = useStreamingState();

  // Build search index incrementally
  const searchIndexRef = useRef<Map<number, string>>(new Map());
  const prevTurnsLengthRef = useRef(0);
  const searchIndex = useMemo(() => {
    if (turns.length === 0) {
      searchIndexRef.current = new Map();
      prevTurnsLengthRef.current = 0;
      return searchIndexRef.current;
    }
    if (prevTurnsLengthRef.current === 0) {
      // Full rebuild on first load
      searchIndexRef.current = buildSearchIndex(turns);
    } else {
      // Incremental: update only new + last turn (last may have grown)
      const changedTurns = turns.slice(Math.max(0, prevTurnsLengthRef.current - 1));
      searchIndexRef.current = updateSearchIndex(searchIndexRef.current, changedTurns);
    }
    prevTurnsLengthRef.current = turns.length;
    return searchIndexRef.current;
  }, [turns]);

  // Check if the last turn had a tool_result with is_error
  const lastTurnHadError = useMemo(() => {
    if (turns.length === 0) return false;
    const lastTurn = turns[turns.length - 1];
    return lastTurn.events.some((evt) => {
      if (evt.type !== "user") return false;
      const msg = (evt as { message?: { content?: unknown[] } }).message;
      if (!Array.isArray(msg?.content)) return false;
      return msg.content.some(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type: string }).type === "tool_result" &&
          "is_error" in item &&
          (item as { is_error: boolean }).is_error === true,
      );
    });
  }, [turns]);

  // Scroll to highlighted turn (works with virtualization via DOM query)
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

  // Handle permission mode change -- POST to server, update local state
  const handlePermissionModeChange = useCallback(
    async (newMode: PermissionMode) => {
      const targetId = activeSessionId;
      if (!targetId) return;

      try {
        const res = await fetch(`/api/sessions/${targetId}/permission-mode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: newMode }),
        });
        if (res.ok) {
          setPermissionMode(newMode);
        }
      } catch {
        // Silently fail -- badge stays at current mode
      }
    },
    [activeSessionId]
  );

  // Handle Ctrl+F to open search and Shift+Tab to cycle permission mode
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
      // Shift+Tab to cycle permission mode
      if (e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const next = cyclePermissionMode(permissionMode);
        handlePermissionModeChange(next);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSearch, permissionMode, handlePermissionModeChange]);

  // Filter turns by search query using pre-built search index
  const filteredTurns = useMemo(
    () => filterTurnsByQuery(turns, searchIndex, searchQuery),
    [turns, searchIndex, searchQuery],
  );

  const handleCompactNow = useCallback(async () => {
    const targetId = activeSessionId || sessionId;
    if (!targetId) return;
    try {
      await fetch(`/api/sessions/${targetId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "/compact" }),
      });
    } catch {
      // Silently fail -- user can retry manually
    }
  }, [activeSessionId, sessionId]);

  /** Extract text from the last N assistant responses for /copy */
  const getAssistantResponses = useCallback((count: number): string[] => {
    const assistantEvents = events.filter(
      (e): e is AssistantEvent => e.type === "assistant"
    );
    const lastN = assistantEvents.slice(-count);
    return lastN.map((evt) => {
      const items = normalizeContent(evt.message?.content);
      return items
        .filter((item) => item.type === "text" && "text" in item)
        .map((item) => ("text" in item ? item.text : ""))
        .join("\n");
    }).filter((text) => text.length > 0);
  }, [events]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
      setShowScrollDown(false);
    }
  }, []);

  // Wire keyboard shortcuts (T3-11)
  const handleClear = useCallback(async () => {
    if (!sessionCwd) return;
    try {
      const res = await fetch("/api/sessions/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: sessionCwd }),
      });
      const data = await res.json();
      if (data.sessionId) {
        onSessionStarted?.(data.sessionId);
      }
    } catch {
      // Silently fail
    }
  }, [sessionCwd, onSessionStarted]);

  const handleDismiss = useCallback(() => {
    if (showSearch) {
      setShowSearch(false);
      setSearchQuery("");
    }
  }, [showSearch]);

  useKeyboardShortcuts({
    onClear: handleClear,
    onCompact: handleCompactNow,
    onDismiss: handleDismiss,
  });

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
            <span className="text-xs font-semibold text-dt-green bg-dt-green-dim px-1.5 py-px rounded-dt-xs uppercase tracking-[0.5px]">
              live
            </span>
          )}
        </div>
        <div className="flex gap-1 items-center">
          <ThemePicker />
          {activeSessionId && (
            <PermissionModeBadge
              mode={permissionMode}
              onModeChange={handlePermissionModeChange}
            />
          )}
          <span className="text-sm text-dt-text2">
            {turns.length} turn{turns.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Search bar (Ctrl+F) */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-dt-bg2 border-b border-dt-border shrink-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-50 shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
            onClick={() => {
              setShowSearch(false);
              setSearchQuery("");
            }}
            className="bg-none border-none text-dt-text2 cursor-pointer text-md px-0.5"
          >
            {"×"}
          </button>
        </div>
      )}

      {/* Context warning banner */}
      <ContextWarningBanner
        contextPercent={metrics?.contextPercent}
        onCompactNow={handleCompactNow}
      />

      {/* Turn list (virtualized, scrollable) */}
      <VirtualizedTurnList
        scrollRef={scrollRef}
        handleScroll={handleScroll}
        filteredTurns={filteredTurns}
        turns={turns}
        autoScroll={autoScroll}
        highlightedTurnIndex={highlightedTurnIndex}
        onAgentPillClick={onAgentPillClick}
        onTurnClick={onTurnClick}
        permissions={permissions}
        onPermissionDecide={onPermissionDecide}
        onDecideSession={onDecideSession}
        questions={questions}
        onSubmitAnswer={onSubmitAnswer}
        streamingState={streamingState}
      />

      {/* Scroll-to-bottom button */}
      {showScrollDown && (
        <div className="absolute bottom-30 left-1/2 -translate-x-1/2 z-10">
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
      <PromptInput sessionCwd={sessionCwd} sessionId={sessionId} projectHash={projectHash} activeSessionId={activeSessionId} onSessionStarted={onSessionStarted} getAssistantResponses={getAssistantResponses} metrics={metrics} usage={usage} costs={costs} events={events} onOpenPanel={onOpenPanel} hasMessages={turns.length > 0} lastTurnHadError={lastTurnHadError} onStreamingEvent={streamingActions.handleSSEEvent} onStreamingReset={streamingActions.reset} />
    </div>
  );
}
