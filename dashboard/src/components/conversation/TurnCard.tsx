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
      className="flex items-center gap-1.5 font-mono"
      style={{ marginTop: 10, fontSize: 10, color: "var(--t3)" }}
    >
      {isStreaming ? (
        <>
          <span
            className="shrink-0"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--amb)",
              animation: "pulse 1.5s infinite",
              display: "inline-block",
            }}
          />
          <span>Generating...</span>
          <span>{formatDuration(elapsed)}</span>
        </>
      ) : (
        <>
          <span style={{ color: "var(--grn)" }}>&#10003;</span>
          <span data-testid="turn-completion-timestamp">
            {turn.durationMs != null
              ? `Completed in ${formatDuration(turn.durationMs)}`
              : "Completed"}
          </span>
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
      className={`conv-turn ${isHighlighted ? "highlighted" : ""}`}
      onClick={onTurnClick}
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* ── User message (hidden when no prompt) ── */}
      {turn.promptText.trim() && (
        <div className="flex items-start" style={{ gap: 10 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 600,
              background: "var(--bg-h)",
              color: "var(--t2)",
            }}
          >
            U
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3, fontWeight: 500 }}>
              You
            </div>
            <div style={{ fontSize: 13, color: "var(--t1)", lineHeight: 1.65 }}>
              <CollapsiblePrompt text={turn.promptText} />
            </div>
          </div>
        </div>
      )}

      {/* ── Claude message ── */}
      {(responseContent.length > 0 || turnEvents.length > 0) && (
        <div className="flex items-start" style={{ gap: 10 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 600,
              background: "var(--acc-bg)",
              color: "var(--acc)",
            }}
          >
            C
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3, fontWeight: 500 }}>
              Claude
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

            {/* Final response text — only non-narration text blocks */}
            {responseContent
              .filter((tagged): tagged is TaggedContent & { item: ContentItem & { text: string } } =>
                !tagged.isNarration && isTextItem(tagged.item))
              .map((tagged, i) => (
                <div
                  key={`text-${i}`}
                  className="msg-text"
                  style={{
                    fontSize: 13,
                    color: "var(--t1)",
                    lineHeight: 1.65,
                    marginTop: i > 0 ? 10 : 0,
                  }}
                >
                  <ResponseBlock text={tagged.item.text} />
                </div>
              ))}

            {/* Tool entries (grouped card) -- click opens bottom panel tool-call tab */}
            <ToolEntries events={turnEvents} onToolClick={onToolClick} />

            {/* Task progress (only shown on turns that executed task tool calls) */}
            {tasks && tasks.length > 0 && (
              <div style={{ marginTop: 8 }}>
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
              <div
                className="flex items-center"
                style={{ marginTop: 8, fontSize: 13, color: "var(--t2)", gap: 6 }}
              >
                <span
                  className="shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--amb)",
                    animation: "pulse 1.5s infinite",
                    display: "inline-block",
                  }}
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
