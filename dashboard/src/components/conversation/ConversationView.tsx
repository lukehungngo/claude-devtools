import { useRef, useState, useEffect, useCallback, useMemo, useContext, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SessionEvent, SessionMetrics, PermissionRequest, AssistantEvent } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { LayoutContext } from "../../contexts/LayoutContext";
import { normalizeContent } from "../../lib/normalizeContent";
import { buildSearchIndex, updateSearchIndex, filterTurnsByQuery } from "../../lib/searchIndex";
import { getEventsForTurn } from "../../lib/turnSnapshot";
import { PermissionBlock } from "./PermissionBlock";
import { cyclePermissionMode } from "./PermissionModeBadge";
import type { PermissionMode } from "./permissionModeTypes";
import { RewindMenu } from "./RewindMenu";
import { RotateCcw } from "lucide-react";
import { QuestionBlock } from "./QuestionBlock";
import { PromptInput } from "./PromptInput";
import { ContextWarningBanner } from "./ContextWarningBanner";
import { MemoTurnCard } from "./TurnCard";
import { TurnDivider } from "./TurnDivider";
import { StaticCompactMarker } from "./StaticCompactMarker";
import { extractCompactMarkers, type CompactMarker } from "../../lib/compactEvents";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useStreamingState } from "../../hooks/useStreamingState";
import { StreamingTurnArea } from "./StreamingTurnArea";
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
  /** Called when slash commands request opening a panel */
  onOpenPanel?: (panel: string) => void;
  /** Called when SDK result delivers an authoritative context window size */
  onSdkContextWindow?: (contextWindow: number) => void;
}

// ─── Virtualized turn list ──────────────────────────────────────────

type TaskItem = { id: string; name: string; status: "done" | "pending" | "in_progress" | "error" };

interface VirtualizedTurnListProps {
  scrollRef: React.RefObject<HTMLDivElement>;
  handleScroll: () => void;
  filteredTurns: TurnSnapshot[];
  turns: TurnSnapshot[];
  allEvents: SessionEvent[];
  autoScroll: boolean;
  highlightedTurnIndex?: number;
  onAgentPillClick?: (agentId: string) => void;
  onTurnClick?: (turnIndex: number) => void;
  onToolClick?: (toolName: string) => void;
  permissions?: PermissionRequest[];
  onPermissionDecide?: (id: string, decision: "approved" | "denied") => void;
  onDecideSession?: (id: string) => void;
  questions?: QuestionItem[];
  onSubmitAnswer?: (questionId: string, answer: string) => void;
  streamingState: import("../../lib/streaming-types").StreamingState;
  tasksByTurn?: Map<number, TaskItem[]>;
  sessionIsRunning?: boolean;
  /** compact_boundary markers grouped by the turn they follow (turnNumber -> markers). */
  compactMarkersByTurn?: Map<number, CompactMarker[]>;
}

/** Props for TurnRow — pre-computed values to avoid per-row work */
interface TurnRowProps {
  turn: TurnSnapshot;
  filteredIndex: number;
  unfilteredIndex: number;
  allEvents: SessionEvent[];
  highlightedTurnIndex?: number;
  onAgentPillClick?: (agentId: string) => void;
  onTurnClick?: (turnIndex: number) => void;
  onToolClick?: (toolName: string) => void;
  turnPerms: PermissionRequest[];
  onPermissionDecide?: (id: string, decision: "approved" | "denied") => void;
  onDecideSession?: (id: string) => void;
  turnQuestions: QuestionItem[];
  onSubmitAnswer?: (questionId: string, answer: string) => void;
  tasks?: TaskItem[];
  sessionIsRunning?: boolean;
  /** compact_boundary markers to render AFTER this turn (between it and the next). */
  compactMarkers: CompactMarker[];
}

/** Render a single turn with its permissions and questions */
function TurnRow({
  turn,
  filteredIndex,
  unfilteredIndex,
  allEvents,
  highlightedTurnIndex,
  onAgentPillClick,
  onTurnClick,
  onToolClick,
  turnPerms,
  onPermissionDecide,
  onDecideSession,
  turnQuestions,
  onSubmitAnswer,
  tasks,
  sessionIsRunning,
  compactMarkers,
}: TurnRowProps) {
  return (
    <>
      {filteredIndex > 0 && (
        <TurnDivider
          turnNumber={turn.turnNumber}
          turnIndex={unfilteredIndex}
          isSelected={highlightedTurnIndex === unfilteredIndex}
          onClick={() => onTurnClick?.(unfilteredIndex)}
        />
      )}
      <MemoTurnCard
        turn={turn}
        allEvents={allEvents}
        isHighlighted={highlightedTurnIndex === unfilteredIndex}
        onAgentPillClick={onAgentPillClick}
        onTurnClick={onTurnClick ? () => onTurnClick(unfilteredIndex) : undefined}
        onToolClick={onToolClick}
        tasks={tasks}
        sessionIsRunning={sessionIsRunning}
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
      {compactMarkers.map((m) => (
        <StaticCompactMarker key={m.uuid} marker={m} />
      ))}
    </>
  );
}

/** Custom comparator — checks fields that affect TurnRow rendering.
 *
 * `turn.status` was removed from TurnSnapshot; a status flip always coincides
 * with new events being appended, which advances `endIndex`. The `endIndex`
 * check therefore already captures the same invalidation signal without a
 * per-memo O(n) predicate scan.
 */
function turnRowAreEqual(prev: Readonly<TurnRowProps>, next: Readonly<TurnRowProps>): boolean {
  if (prev.compactMarkers.length !== next.compactMarkers.length) return false;
  for (let i = 0; i < prev.compactMarkers.length; i++) {
    if (prev.compactMarkers[i].uuid !== next.compactMarkers[i].uuid) return false;
  }
  return (
    prev.turn.turnNumber === next.turn.turnNumber &&
    prev.turn.endIndex === next.turn.endIndex &&
    prev.turn.durationMs === next.turn.durationMs &&
    prev.turn.cost === next.turn.cost &&
    prev.turn.agents.length === next.turn.agents.length &&
    prev.filteredIndex === next.filteredIndex &&
    prev.unfilteredIndex === next.unfilteredIndex &&
    prev.highlightedTurnIndex === next.highlightedTurnIndex &&
    prev.onAgentPillClick === next.onAgentPillClick &&
    prev.onTurnClick === next.onTurnClick &&
    prev.onToolClick === next.onToolClick &&
    prev.turnPerms.length === next.turnPerms.length &&
    prev.turnQuestions.length === next.turnQuestions.length &&
    prev.tasks === next.tasks &&
    prev.sessionIsRunning === next.sessionIsRunning
  );
}

const MemoTurnRow = memo(TurnRow, turnRowAreEqual);

// Stable empty arrays to avoid creating new refs on every render
const emptyPerms: PermissionRequest[] = [];
const emptyQuestions: QuestionItem[] = [];
const emptyCompactMarkers: CompactMarker[] = [];

function VirtualizedTurnList({
  scrollRef,
  handleScroll,
  filteredTurns,
  turns,
  allEvents,
  autoScroll,
  highlightedTurnIndex,
  onAgentPillClick,
  onTurnClick,
  onToolClick,
  permissions,
  onPermissionDecide,
  onDecideSession,
  questions,
  onSubmitAnswer,
  streamingState,
  tasksByTurn,
  sessionIsRunning,
  compactMarkersByTurn,
}: VirtualizedTurnListProps) {
  const virtualizer = useVirtualizer({
    count: filteredTurns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  // O(1) lookup: turn object -> unfiltered index (avoids O(n) indexOf per row)
  const turnIndexMap = useMemo(() => {
    const map = new Map<TurnSnapshot, number>();
    turns.forEach((t, i) => map.set(t, i));
    return map;
  }, [turns]);

  // Only the last turn in the session needs the liveness flag. If turn N has a
  // successor N+1, it is definitively over — the existence of the next turn is
  // proof. Passing sessionIsRunning to historical turns causes them to pulse
  // "running" when their main agent stopped on tool_use (MAS dispatch pattern)
  // and has no terminal signal in its event slice.
  const lastTurnNumber = turns[turns.length - 1]?.turnNumber;

  // Pre-group permissions by turn (avoids O(perms) filter per row)
  const permsByTurn = useMemo(() => {
    const map = new Map<number, PermissionRequest[]>();
    if (!permissions || permissions.length === 0) return map;
    for (const p of permissions) {
      if (!p.timestamp) continue;
      // Find which turn this permission belongs to by timestamp range
      for (let i = 0; i < filteredTurns.length; i++) {
        const t = filteredTurns[i];
        const nextStart = filteredTurns[i + 1]?.startTime;
        if (p.timestamp >= t.startTime && (!nextStart || p.timestamp < nextStart)) {
          const arr = map.get(i) || [];
          arr.push(p);
          map.set(i, arr);
          break;
        }
      }
    }
    return map;
  }, [permissions, filteredTurns]);

  // Pre-group questions by turn (same pattern)
  const questionsByTurn = useMemo(() => {
    const map = new Map<number, QuestionItem[]>();
    if (!questions || questions.length === 0) return map;
    for (const q of questions) {
      if (!q.timestamp) continue;
      for (let i = 0; i < filteredTurns.length; i++) {
        const t = filteredTurns[i];
        const nextStart = filteredTurns[i + 1]?.startTime;
        if (q.timestamp >= t.startTime && (!nextStart || q.timestamp < nextStart)) {
          const arr = map.get(i) || [];
          arr.push(q);
          map.set(i, arr);
          break;
        }
      }
    }
    return map;
  }, [questions, filteredTurns]);

  // Auto-scroll to bottom when new turns arrive
  useEffect(() => {
    if (autoScroll && filteredTurns.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(filteredTurns.length - 1, { align: "end" });
      });
    }
  }, [filteredTurns.length, autoScroll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to highlighted turn using virtualizer (DOM queries fail for off-screen items)
  useEffect(() => {
    if (highlightedTurnIndex == null) return;
    // O(1) lookup via turnIndexMap instead of O(n^2) findIndex+indexOf
    const filteredIdx = filteredTurns.findIndex(
      (t) => turnIndexMap.get(t) === highlightedTurnIndex
    );
    if (filteredIdx >= 0) {
      virtualizer.scrollToIndex(filteredIdx, { align: "start", behavior: "smooth" });
    }
  }, [highlightedTurnIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const virtualItems = virtualizer.getVirtualItems();
  // Fallback: when virtualizer returns no items but we have turns (e.g., jsdom with 0-height container),
  // render all turns directly without virtualization positioning.
  const useVirtualLayout = virtualItems.length > 0 || filteredTurns.length === 0;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto relative dt-scrollbar"
      style={{ padding: "20px 24px" }}
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
            const unfilteredIdx = turnIndexMap.get(turn) ?? 0;
            return (
              <div
                key={turn.turnNumber}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <MemoTurnRow
                  turn={turn}
                  filteredIndex={virtualItem.index}
                  unfilteredIndex={unfilteredIdx}
                  allEvents={allEvents}
                  highlightedTurnIndex={highlightedTurnIndex}
                  onAgentPillClick={onAgentPillClick}
                  onTurnClick={onTurnClick}
                  onToolClick={onToolClick}
                  turnPerms={permsByTurn.get(virtualItem.index) || emptyPerms}
                  onPermissionDecide={onPermissionDecide}
                  onDecideSession={onDecideSession}
                  turnQuestions={questionsByTurn.get(virtualItem.index) || emptyQuestions}
                  onSubmitAnswer={onSubmitAnswer}
                  tasks={tasksByTurn?.get(turn.turnNumber)}
                  sessionIsRunning={turn.turnNumber === lastTurnNumber ? sessionIsRunning : false}
                  compactMarkers={compactMarkersByTurn?.get(turn.turnNumber) || emptyCompactMarkers}
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* Non-virtualized fallback (jsdom / SSR / 0-height container) */
        filteredTurns.map((turn, filteredIndex) => {
          const unfilteredIdx = turnIndexMap.get(turn) ?? 0;
          return (
            <div key={turn.turnNumber}>
              <MemoTurnRow
                turn={turn}
                filteredIndex={filteredIndex}
                unfilteredIndex={unfilteredIdx}
                allEvents={allEvents}
                highlightedTurnIndex={highlightedTurnIndex}
                onAgentPillClick={onAgentPillClick}
                onTurnClick={onTurnClick}
                onToolClick={onToolClick}
                turnPerms={permsByTurn.get(filteredIndex) || emptyPerms}
                onPermissionDecide={onPermissionDecide}
                onDecideSession={onDecideSession}
                turnQuestions={questionsByTurn.get(filteredIndex) || emptyQuestions}
                onSubmitAnswer={onSubmitAnswer}
                tasks={tasksByTurn?.get(turn.turnNumber)}
                sessionIsRunning={turn.turnNumber === lastTurnNumber ? sessionIsRunning : false}
                compactMarkers={compactMarkersByTurn?.get(turn.turnNumber) || emptyCompactMarkers}
              />
            </div>
          );
        })
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
  onSdkContextWindow,
}: ConversationViewProps) {
  const layoutCtx = useContext(LayoutContext);
  const usage = layoutCtx?.usage ?? null;
  const costs = layoutCtx?.costs ?? null;
  const openBottomTabRef = layoutCtx?.openBottomTabRef ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  // Permission mode managed in AppLayout via LayoutContext
  const permissionMode = layoutCtx?.permissionMode ?? "default";
  const setPermissionMode = layoutCtx?.setPermissionMode;

  const { state: streamingState, actions: streamingActions } = useStreamingState();

  // Surface SDK context window to parent when result event delivers it
  const prevSdkContextWindow = useRef<number | null>(null);
  useEffect(() => {
    if (streamingState.sdkContextWindow && streamingState.sdkContextWindow !== prevSdkContextWindow.current) {
      prevSdkContextWindow.current = streamingState.sdkContextWindow;
      onSdkContextWindow?.(streamingState.sdkContextWindow);
    }
  }, [streamingState.sdkContextWindow, onSdkContextWindow]);

  // B2-WIRE — bridge OTel result fields into LayoutContext so BottomPanel's
  // Cost tab can render OtelResultRow. Mirrors the sdkContextWindow bridge
  // above; pushed into context (not a callback prop) because the consumer
  // (BottomPanel) lives in AppLayout, parallel to SessionPage.
  const setLastResultStopReason = layoutCtx?.setLastResultStopReason;
  const setLastResultFinishReasons = layoutCtx?.setLastResultFinishReasons;
  useEffect(() => {
    setLastResultStopReason?.(streamingState.lastResultStopReason);
  }, [streamingState.lastResultStopReason, setLastResultStopReason]);
  useEffect(() => {
    setLastResultFinishReasons?.(streamingState.lastResultFinishReasons);
  }, [streamingState.lastResultFinishReasons, setLastResultFinishReasons]);

  const [showRewindMenu, setShowRewindMenu] = useState(false);

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
      searchIndexRef.current = buildSearchIndex(turns, events);
    } else {
      // Incremental: update only new + last turn (last may have grown)
      const changedTurns = turns.slice(Math.max(0, prevTurnsLengthRef.current - 1));
      searchIndexRef.current = updateSearchIndex(searchIndexRef.current, changedTurns, events);
    }
    prevTurnsLengthRef.current = turns.length;
    return searchIndexRef.current;
  }, [turns, events]);

  // Check if the last turn had a tool_result with is_error
  const lastTurnHadError = useMemo(() => {
    if (turns.length === 0) return false;
    const lastTurn = turns[turns.length - 1];
    const lastTurnEvents = getEventsForTurn(lastTurn, events);
    return lastTurnEvents.some((evt) => {
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
  }, [turns, events]);

  // Derive task items per-turn from tool_use events (TodoWrite, TaskCreate, TaskUpdate)
  // Returns a map of turnNumber -> cumulative task state at that turn (only for turns with task tool calls)
  const tasksByTurn = useMemo(() => {
    type TaskItem = { id: string; name: string; status: "done" | "pending" | "in_progress" | "error" };
    const TASK_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate"]);

    const normalizeStatus = (s: unknown): TaskItem["status"] => {
      if (s === "completed" || s === "done") return "done";
      if (s === "in_progress") return "in_progress";
      if (s === "error") return "error";
      return "pending";
    };

    const result = new Map<number, TaskItem[]>();
    let tasks: TaskItem[] = [];

    for (const turn of turns) {
      const turnEvents = getEventsForTurn(turn, events);
      let turnHasTaskTools = false;

      for (const evt of turnEvents) {
        if (evt.type !== "assistant") continue;
        const msg = (evt as AssistantEvent).message;
        if (!Array.isArray(msg?.content)) continue;

        for (const item of msg.content) {
          if (
            typeof item !== "object" ||
            item === null ||
            !("type" in item) ||
            (item as { type: string }).type !== "tool_use"
          ) continue;

          const toolUse = item as { type: "tool_use"; name: string; input: Record<string, unknown> };
          if (!TASK_TOOLS.has(toolUse.name)) continue;
          turnHasTaskTools = true;

          if (toolUse.name === "TodoWrite") {
            const todos = toolUse.input.todos;
            if (!Array.isArray(todos)) continue;
            tasks = todos.map((todo: unknown, idx: number) => {
              const t = todo as { content?: string; status?: string };
              return {
                id: `T-${String(idx + 1).padStart(3, "0")}`,
                name: t.content ?? `Task ${idx + 1}`,
                status: normalizeStatus(t.status),
              };
            });
          } else if (toolUse.name === "TaskCreate") {
            const desc = toolUse.input.description;
            tasks = [...tasks, {
              id: `T-${String(tasks.length + 1).padStart(3, "0")}`,
              name: typeof desc === "string" ? desc : `Task ${tasks.length + 1}`,
              status: "pending",
            }];
          }
        }
      }

      if (turnHasTaskTools && tasks.length > 0) {
        result.set(turn.turnNumber, [...tasks]);
      }
    }

    return result;
  }, [turns, events]);

  // Inline compact_boundary markers for replayed sessions (FU-4).
  // Live SSE sessions surface compaction via StreamingTurnArea's 3s banner;
  // historical sessions previously had no visual indicator.
  const compactMarkersByTurn = useMemo(() => {
    const markers = extractCompactMarkers(events, turns);
    const byTurn = new Map<number, CompactMarker[]>();
    for (const m of markers) {
      const arr = byTurn.get(m.turnNumber);
      if (arr) {
        arr.push(m);
      } else {
        byTurn.set(m.turnNumber, [m]);
      }
    }
    return byTurn;
  }, [events, turns]);

  // Scroll to highlighted turn is handled by VirtualizedTurnList via virtualizer.scrollToIndex

  // Detect user scroll to toggle auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
    setShowScrollDown(!atBottom);
  }, []);

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
        setPermissionMode?.(cyclePermissionMode(permissionMode));
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSearch, permissionMode, setPermissionMode]);

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

  // TASK-006: click-to-detail handler for tool entries -> bottom panel
  const handleToolClick = useCallback(() => {
    openBottomTabRef?.current?.("tool-call");
  }, [openBottomTabRef]);

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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

  const handleToggleSearch = useCallback(() => {
    setShowSearch((prev) => {
      if (!prev) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        setSearchQuery("");
      }
      return !prev;
    });
  }, []);

  const handleToggleMonitor = useCallback(() => {
    onOpenPanel?.("monitor");
  }, [onOpenPanel]);

  const handleModelPicker = useCallback(() => {
    onOpenPanel?.("settings");
  }, [onOpenPanel]);

  const handleRewind = useCallback(async (userMessageId: string, dryRun: boolean): Promise<void> => {
    const targetId = activeSessionId || sessionId;
    if (!targetId) return;
    const res = await fetch(`/api/sessions/${targetId}/rewind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessageId, dryRun }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, [activeSessionId, sessionId]);

  const handleToggleFastMode = useCallback(async () => {
    const targetId = activeSessionId || sessionId;
    if (!targetId) return;
    try {
      await fetch(`/api/sessions/${targetId}/fast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
    } catch { /* silent */ }
  }, [activeSessionId, sessionId]);

  useKeyboardShortcuts({
    onClear: handleClear,
    onCompact: handleCompactNow,
    onDismiss: handleDismiss,
    onToggleSearch: handleToggleSearch,
    onToggleMonitor: handleToggleMonitor,
    onModelPicker: handleModelPicker,
    onToggleFastMode: handleToggleFastMode,
    onRewindMenu: () => setShowRewindMenu(true),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ background: "var(--bg)" }}>
      {/* Search bar (Ctrl+F) */}
      {showSearch && (
        <div
          className="flex items-center shrink-0"
          style={{ gap: 8, padding: "8px 24px", background: "var(--bg-s)", borderBottom: "1px solid var(--bd)" }}
        >
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
            className="flex-1 bg-transparent border-none outline-none text-dt-text0 font-mono text-base placeholder:text-dt-text2/60"
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
        allEvents={events}
        autoScroll={autoScroll}
        highlightedTurnIndex={highlightedTurnIndex}
        onAgentPillClick={onAgentPillClick}
        onTurnClick={onTurnClick}
        onToolClick={handleToolClick}
        permissions={permissions}
        onPermissionDecide={onPermissionDecide}
        onDecideSession={onDecideSession}
        questions={questions}
        onSubmitAnswer={onSubmitAnswer}
        streamingState={streamingState}
        tasksByTurn={tasksByTurn}
        compactMarkersByTurn={compactMarkersByTurn}
        sessionIsRunning={
          // Prefer authoritative SDK session_state_changed signal over mtime heuristic.
          // Fall back to isActive (12-hour mtime), NOT isRunning (2-minute mtime).
          // isRunning answers "is the session actively streaming?" (sidebar green dot).
          // isActive answers "is this session still alive?" (TurnCard indeterminate guard).
          streamingState.sessionState != null
            ? streamingState.sessionState === "running"
            : metrics?.session?.isActive
        }
      />

      {/* Scroll-to-bottom button */}
      {showScrollDown && (
        <div className="absolute bottom-30 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="bg-dt-bg3/80 backdrop-blur-dt-sm border border-dt-border rounded-full text-dt-text1 px-4 py-1.5 text-sm cursor-pointer flex items-center gap-1 shadow-dt-md hover:bg-dt-bg4 transition-all duration-dt-fast"
          >
            {"\u2193"} New turns
          </button>
        </div>
      )}

      {/* Rewind trigger button — visible entry point for the RewindMenu */}
      <div className="flex items-center shrink-0 px-6 pt-1">
        <button
          onClick={() => setShowRewindMenu(true)}
          aria-label="Rewind conversation"
          className="flex items-center gap-1 text-xs text-dt-text3 hover:text-dt-text1 transition-colors duration-dt-fast"
        >
          <RotateCcw size={11} />
          Rewind
        </button>
      </div>

      {/* Command input — hidden until ready to release */}

      {/* RewindMenu — conditionally rendered on Esc+Esc or trigger button click */}
      {showRewindMenu && (
        <RewindMenu
          turns={turns}
          allEvents={events}
          sessionId={sessionId ?? ""}
          onClose={() => setShowRewindMenu(false)}
          onRewind={handleRewind}
          currentTurnNumber={turns[turns.length - 1]?.turnNumber}
        />
      )}
    </div>
  );
}
