import { useState, useEffect, useMemo, memo } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";
import type {
  SessionEvent,
  AssistantEvent,
  ContentItem,
} from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { formatDuration } from "../../lib/cost";
import { AgentPills } from "./AgentPills";
import { CollapsiblePrompt } from "./CollapsiblePrompt";
import { ThinkingGroup } from "../viewer/ThinkingBlock";
import { NarrationGroup } from "./NarrationGroup";
import { ResponseBlock } from "../viewer/ResponseBlock";
import { ToolEntries } from "./ToolEntries";
import { CostFooter } from "./CostFooter";
import { ProgressBar } from "./ProgressBar";
import { TaskGrid } from "./TaskGrid";

interface TaskItem {
  id: string;
  name: string;
  status: "done" | "pending" | "in_progress" | "error";
}

interface TurnCardProps {
  turn: TurnSnapshot;
  allEvents: SessionEvent[];
  isHighlighted?: boolean;
  onAgentPillClick?: (agentId: string) => void;
  onTurnClick?: () => void;
  onToolClick?: (toolName: string) => void;
  tasks?: TaskItem[];
  /** Server-side session.isRunning (JSONL mtime < 2min). When false, suppresses "Generating..." on stale turns. */
  sessionIsRunning?: boolean;
}

// ─── Content renderers ───────────────────────────────────────────────

interface TaggedContent {
  item: ContentItem;
  /** True when this text block precedes tool calls — narration, not final response */
  isNarration: boolean;
}

function isTextItem(item: ContentItem): item is ContentItem & { text: string } {
  return item.type === "text" && "text" in item;
}

function extractResponseContent(events: SessionEvent[]): TaggedContent[] {
  // First pass: collect text/thinking items with their event index
  const items: { item: ContentItem; eventIdx: number }[] = [];
  // Track which event indices contain tool_use
  let lastToolUseIdx = -1;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "assistant" || event.isSidechain) continue;
    const asst = event as AssistantEvent;
    const content = normalizeContent(asst.message?.content);
    const hasToolUse = content.some((c) => c.type === "tool_use");
    if (hasToolUse) lastToolUseIdx = i;
    for (const c of content) {
      if (c.type === "text" || c.type === "thinking") {
        items.push({ item: c, eventIdx: i });
      }
    }
  }

  // Second pass: a text item is narration if any later event has tool_use
  // We find the last event index that has a tool_use, then all text before it is narration
  return items.map(({ item, eventIdx }) => ({
    item,
    isNarration: item.type === "text" && eventIdx < lastToolUseIdx,
  }));
}

// ─── Fallback duration from timestamps ──────────────────────────────

function computeFallbackDuration(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  try {
    const elapsed = new Date(endTime).getTime() - new Date(startTime).getTime();
    return elapsed > 0 ? elapsed : null;
  } catch {
    return null;
  }
}

// ─── Model name formatting ───────────────────────────────────────────

/**
 * Shorten a model ID for display.
 * "claude-sonnet-4-6"          → "sonnet-4-6"
 * "claude-haiku-4-5-20251001"  → "haiku-4-5"
 */
function formatModelName(model: string): string {
  // Strip leading "claude-"
  let name = model.startsWith("claude-") ? model.slice("claude-".length) : model;
  // Strip trailing date suffix (8-digit YYYYMMDD)
  name = name.replace(/-\d{8}$/, "");
  return name;
}

// ─── TurnFooter (elapsed / completed duration) ─────────────────────

function TurnFooter({ turn, sessionIsRunning }: { turn: TurnSnapshot; sessionIsRunning?: boolean }) {
  // A turn is truly streaming only if:
  // 1. Its status is "running" (no end_turn / turn_duration marker in JSONL), AND
  // 2. The server confirms the session is still active.
  //    For SSE sessions: uses SDK's session_state_changed event (authoritative).
  //    For JSONL sessions: server uses mtime < 2min heuristic (SessionInfo.isRunning).
  // This prevents stale "Generating..." on sessions that ended without clean markers.
  const isStreaming = turn.status === "running" && sessionIsRunning !== false;
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!isStreaming) return;
    const startMs = new Date(turn.startTime).getTime();
    const tick = () => setElapsed(Date.now() - startMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isStreaming, turn.startTime]);

  return (
    <div
      data-testid="turn-completion-indicator"
      className="flex items-center gap-1.5 font-mono mt-2.5 text-[10px]"
      style={{ color: "var(--t3)" }}
    >
      {isStreaming ? (
        <>
          <span
            className="shrink-0 inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--amb)", animation: "pulse 1.5s infinite" }}
          />
          <span>Generating...</span>
          <span>{formatDuration(elapsed)}</span>
        </>
      ) : (
        <>
          <span style={{ color: "var(--grn)" }}>&#10003;</span>
          <span data-testid="turn-completion-timestamp">
            {(() => {
              const duration = turn.durationMs ?? computeFallbackDuration(turn.startTime, turn.endTime);
              return duration != null
                ? `Completed in ${formatDuration(duration)}`
                : "Completed";
            })()}
          </span>
        </>
      )}
      {turn.model && (
        <>
          <span>&middot;</span>
          <span data-testid="turn-model-badge">{formatModelName(turn.model)}</span>
        </>
      )}
    </div>
  );
}

// ─── TurnCard ────────────────────────────────────────────────────────

/** Custom comparator for React.memo — checks fields that affect rendering */
export function turnCardAreEqual(
  prev: Readonly<TurnCardProps>,
  next: Readonly<TurnCardProps>,
): boolean {
  return (
    prev.turn.turnNumber === next.turn.turnNumber &&
    prev.turn.status === next.turn.status &&
    prev.turn.endIndex === next.turn.endIndex &&
    prev.turn.durationMs === next.turn.durationMs &&
    prev.turn.cost === next.turn.cost &&
    prev.turn.agents.length === next.turn.agents.length &&
    prev.turn.model === next.turn.model &&
    prev.isHighlighted === next.isHighlighted &&
    prev.onAgentPillClick === next.onAgentPillClick &&
    prev.onTurnClick === next.onTurnClick &&
    prev.onToolClick === next.onToolClick &&
    prev.tasks?.length === next.tasks?.length &&
    prev.sessionIsRunning === next.sessionIsRunning
  );
}

export function TurnCard({
  turn,
  allEvents,
  isHighlighted = false,
  onAgentPillClick,
  onTurnClick,
  onToolClick,
  tasks,
  sessionIsRunning,
}: TurnCardProps) {
  const isRunning = turn.status === "running" && sessionIsRunning !== false;
  const turnEvents = useMemo(() => getEventsForTurn(turn, allEvents), [turn, allEvents]);
  const responseContent = extractResponseContent(turnEvents);
  const agentCost = useMemo(
    () => turn.agents.reduce((s, a) => s + a.cost, 0),
    [turn.agents],
  );

  return (
    <div
      className={`conv-turn flex flex-col gap-5 ${isHighlighted ? "highlighted" : ""}`}
      onClick={onTurnClick}
    >
      {/* ── User message (hidden when no prompt) ── */}
      {turn.promptText.trim() && (
        <div className="flex items-start gap-2.5">
          <div
            className="flex items-center justify-center shrink-0 w-7 h-7 rounded-[7px] text-[11px] font-semibold"
            style={{ background: "var(--bg-h)", color: "var(--t2)" }}
          >
            U
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-medium mb-0.5" style={{ color: "var(--t3)" }}>
              You
            </div>
            <div className="text-[13px] leading-[1.65]" style={{ color: "var(--t1)" }}>
              <CollapsiblePrompt text={turn.promptText} />
            </div>
          </div>
        </div>
      )}

      {/* ── Claude message ── */}
      {(responseContent.length > 0 || turnEvents.length > 0) && (
        <div className="flex items-start gap-2.5">
          <div
            className="flex items-center justify-center shrink-0 w-7 h-7 rounded-[7px] text-[11px] font-semibold"
            style={{ background: "var(--acc-bg)", color: "var(--acc)" }}
          >
            C
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-medium mb-0.5" style={{ color: "var(--t3)" }}>
              <span>Claude</span>
              {turn.model && (
                <span data-testid="turn-header-model-badge" className="font-mono">
                  {formatModelName(turn.model)}
                </span>
              )}
            </div>

            {/* Agent pills */}
            <AgentPills agents={turn.agents} onPillClick={onAgentPillClick} />

            {/* Thinking group (collapsed by default) */}
            <ThinkingGroup items={responseContent.filter((t) => t.item.type === "thinking" && "thinking" in t.item).map((t) => t.item)} />

            {/* Narration text (collapsed by default) — working notes before tool calls */}
            <NarrationGroup
              items={responseContent
                .filter((t) => t.isNarration && isTextItem(t.item))
                .map((t) => (t.item as ContentItem & { text: string }).text)}
            />

            {/* Tool entries (grouped card) -- click opens bottom panel tool-call tab */}
            <ToolEntries events={turnEvents} onToolClick={onToolClick} />

            {/* Final response text — only non-narration text blocks */}
            {responseContent
              .filter((tagged): tagged is TaggedContent & { item: ContentItem & { text: string } } =>
                !tagged.isNarration && isTextItem(tagged.item))
              .map((tagged, i) => (
                <div
                  key={`text-${i}`}
                  className={`msg-text text-[13px] leading-[1.65]${i > 0 ? " mt-2.5" : ""}`}
                  style={{ color: "var(--t1)" }}
                >
                  <ResponseBlock text={tagged.item.text} />
                </div>
              ))}

            {/* Task progress (only shown on turns that executed task tool calls) */}
            {tasks && tasks.length > 0 && (
              <div className="mt-2">
                <ProgressBar
                  label="Tasks"
                  completed={tasks.filter((t) => t.status === "done").length}
                  total={tasks.length}
                />
                <TaskGrid tasks={tasks} />
              </div>
            )}

            {/* Cost breakdown */}
            {turn.cost > 0 && (
              <CostFooter
                totalCost={turn.cost}
                mainCost={turn.cost - agentCost}
                mainTurns={1}
                agentCost={agentCost}
                agentCalls={turn.agents.length}
              />
            )}

            {/* Running indicator */}
            {isRunning && (
              <div className="flex items-center mt-2 text-[13px] gap-1.5" style={{ color: "var(--t2)" }}>
                <span
                  className="shrink-0 inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--amb)", animation: "pulse 1.5s infinite" }}
                />
                <span>Working...</span>
              </div>
            )}

            {/* Completion indicator */}
            <TurnFooter turn={turn} sessionIsRunning={sessionIsRunning} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Memoized TurnCard — skips re-render when turn content hasn't changed */
export const MemoTurnCard = memo(TurnCard, turnCardAreEqual);
