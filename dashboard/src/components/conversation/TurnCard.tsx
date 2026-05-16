import { useState, useEffect, useMemo, memo } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";
import { getAgentStatus } from "../../lib/agentStatus";
import type {
  SessionEvent,
  AssistantEvent,
  ContentItem,
} from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { formatDuration } from "../../lib/cost";
import { formatModelName } from "../../lib/formatModelName";
import { AgentPills } from "./AgentPills";
import { BackgroundAgentGroup } from "./BackgroundAgentGroup";
import { toolUseIdToSyntheticAgent } from "../../lib/agentIds";
import type { AgentNode } from "../../lib/types";
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
  /** Server-side session.isActive (12-hour mtime). When false, suppresses "Generating..." on closed/stale turns. */
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

// ─── TurnFooter (elapsed / completed duration) ─────────────────────

function TurnFooter({
  turn,
  turnEvents,
  sessionIsRunning,
}: {
  turn: TurnSnapshot;
  turnEvents: SessionEvent[];
  sessionIsRunning?: boolean;
}) {
  // Three-state status via the single-source-of-truth predicate.
  //   - completed     → main has a terminal signal (end_turn / turn_duration)
  //   - running       → no signal AND the session is still active
  //   - indeterminate → no signal AND the session is closed (truncated,
  //                     aborted, or historical without completion marker).
  //                     Honest render rather than flashing "Generating..." forever.
  //
  // `sessionIsRunning` resolution, in order of authority:
  //   - For SSE sessions: SDK session_state_changed is authoritative.
  //   - For JSONL sessions: server uses JSONL terminal signals (isRunning).
  //   - undefined = safe default "not running". ConversationView passes false
  //     for all non-last turns; only the last turn receives the real flag.
  const sessionIsActive = sessionIsRunning === true;
  const status = getAgentStatus("main", turnEvents, sessionIsActive);
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (status !== "running") return;
    const startMs = new Date(turn.startTime).getTime();
    const tick = () => setElapsed(Date.now() - startMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, turn.startTime]);

  return (
    <div
      data-testid="turn-completion-indicator"
      data-status={status}
      className="flex items-center gap-1.5 t-mono-sm mt-2.5"
      style={{ color: "var(--t3)" }}
    >
      {status === "running" && (
        <>
          <span
            className="shrink-0 inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--amb)", animation: "pulse 1.5s infinite" }}
          />
          <span>Generating...</span>
          <span>{formatDuration(elapsed)}</span>
        </>
      )}
      {status === "completed" && (
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
      {status === "indeterminate" && (
        <>
          <span
            data-testid="turn-indeterminate-dot"
            className="shrink-0 inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--t3)" }}
            title="Session ended without a completion signal"
          />
          <span data-testid="turn-indeterminate-label">
            Session ended without completion
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

/** Custom comparator for React.memo — checks fields that affect rendering.
 *
 * `turn.status` was removed from TurnSnapshot; status flips now happen whenever
 * a completion event (end_turn/turn_duration) is appended, which always advances
 * `endIndex`. The `endIndex` check therefore subsumes the old `status` check
 * without the cost of a per-memo O(n) predicate scan.
 */
export function turnCardAreEqual(
  prev: Readonly<TurnCardProps>,
  next: Readonly<TurnCardProps>,
): boolean {
  return (
    prev.turn.turnNumber === next.turn.turnNumber &&
    prev.turn.endIndex === next.turn.endIndex &&
    prev.turn.durationMs === next.turn.durationMs &&
    prev.turn.cost === next.turn.cost &&
    prev.turn.inputTokens === next.turn.inputTokens &&
    prev.turn.outputTokens === next.turn.outputTokens &&
    prev.turn.cacheReadTokens === next.turn.cacheReadTokens &&
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
  const turnEvents = useMemo(() => getEventsForTurn(turn, allEvents), [turn, allEvents]);
  // Three-state status for the body "Working..." block. We only show the
  // "Working..." line on `running` — `indeterminate` is surfaced by the
  // footer's honest label so we avoid double indicators on the same card.
  const mainStatus = getAgentStatus(
    "main",
    turnEvents,
    sessionIsRunning === true,
  );
  const isRunning = mainStatus === "running";
  const responseContent = extractResponseContent(turnEvents);
  const agentCost = useMemo(
    () => turn.agents.reduce((s, a) => s + a.cost, 0),
    [turn.agents],
  );

  // Background agents (Phase 4.1): synthesize AgentNodes from this turn's
  // Agent tool_use entries. Subagents in this Claude Code variant emit no own
  // events; presence of a matching tool_result determines completion.
  const backgroundAgents = useMemo<AgentNode[]>(() => {
    const dispatches: Array<{
      toolUseId: string;
      description: string;
      subagentType?: string;
      timestamp: string;
    }> = [];
    const toolResults = new Map<string, { ts: string; isError: boolean }>();

    for (const evt of turnEvents) {
      if (evt.isSidechain) continue;
      if (evt.type === "assistant") {
        const content = normalizeContent((evt as AssistantEvent).message?.content);
        for (const c of content) {
          if (c.type !== "tool_use") continue;
          if (c.name !== "Agent" && c.name !== "Task") continue;
          const input = c.input as Record<string, unknown>;
          const desc = typeof input.description === "string" ? input.description : "";
          if (!c.id || !desc) continue;
          dispatches.push({
            toolUseId: c.id,
            description: desc,
            subagentType: typeof input.subagent_type === "string" ? input.subagent_type : undefined,
            timestamp: evt.timestamp,
          });
        }
      } else if (evt.type === "user") {
        const content = normalizeContent(evt.message?.content);
        for (const c of content) {
          if (c.type !== "tool_result") continue;
          const tid = (c as { tool_use_id?: string }).tool_use_id;
          if (!tid) continue;
          toolResults.set(tid, {
            ts: evt.timestamp,
            isError: !!(c as { is_error?: boolean }).is_error,
          });
        }
      }
    }

    return dispatches.map((d): AgentNode => {
      const result = toolResults.get(d.toolUseId);
      const status: AgentNode["status"] = result === undefined
        ? "active"
        : result.isError
          ? "error"
          : "completed";
      return {
        id: toolUseIdToSyntheticAgent(d.toolUseId),
        type: d.subagentType ?? "subagent",
        description: d.description,
        parentId: "main",
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0,
        },
        toolCalls: 0,
        mcpToolCalls: 0,
        status,
        startTime: d.timestamp,
        endTime: result?.ts,
      };
    });
  }, [turnEvents]);

  return (
    <div
      className={`conv-turn flex flex-col gap-5 ${isHighlighted ? "highlighted" : ""}`}
      onClick={onTurnClick}
    >
      {/* ── User message (hidden when no prompt) ── */}
      {turn.promptText.trim() && (
        <div className="flex justify-end">
          <div
            className="t-body"
            style={{
              background: "var(--acc-bg)",
              borderRadius: "var(--r-md) var(--r-md) 4px var(--r-md)",
              padding: "10px 14px",
              maxWidth: "78%",
            }}
          >
            <CollapsiblePrompt text={turn.promptText} />
          </div>
        </div>
      )}

      {/* ── Claude message ── */}
      {(responseContent.length > 0 || turnEvents.length > 0) && (
        <div className="flex flex-col min-w-0 gap-1.5">
          {/* Model badge — preserved for tests; absent when model is falsy */}
          {turn.model && (
            <div className="t-mono-xs" style={{ color: "var(--t3)" }}>
              Claude &middot; <span data-testid="turn-header-model-badge">{formatModelName(turn.model)}</span>
            </div>
          )}

          {/* Agent pills */}
          <AgentPills
            agents={turn.agents}
            turnEvents={turnEvents}
            sessionIsRunning={sessionIsRunning}
            onPillClick={onAgentPillClick}
          />

          {/* Thinking group (collapsed by default) */}
          <ThinkingGroup items={responseContent.filter((t) => t.item.type === "thinking" && "thinking" in t.item).map((t) => t.item)} />

          {/* Narration text (collapsed by default) — working notes before tool calls */}
          <NarrationGroup
            items={responseContent
              .filter((t) => t.isNarration && isTextItem(t.item))
              .map((t) => (t.item as ContentItem & { text: string }).text)}
          />

          {/* Tool entries (grouped card) -- click opens bottom panel tool-call tab */}
          <ToolEntries events={turnEvents} onToolClick={onToolClick} agentSummaries={turn.agents} />

          {/* Phase 4: Background agents dispatch block — collapsible group
              with one row per dispatched Agent tool_use, status from
              matching tool_result. */}
          <BackgroundAgentGroup
            agents={backgroundAgents}
            isLive={sessionIsRunning === true}
            onSelect={onAgentPillClick}
          />

          {/* Final response text — only non-narration text blocks */}
          {responseContent
            .filter((tagged): tagged is TaggedContent & { item: ContentItem & { text: string } } =>
              !tagged.isNarration && isTextItem(tagged.item))
            .map((tagged, i) => (
              <div
                key={`text-${i}`}
                className={`msg-text t-body${i > 0 ? " mt-2.5" : ""}`}
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
              inputTokens={turn.inputTokens}
              outputTokens={turn.outputTokens}
              cacheReadTokens={turn.cacheReadTokens}
            />
          )}

          {/* Running indicator */}
          {isRunning && (
            <div className="flex items-center mt-2 t-body gap-1.5" style={{ color: "var(--t2)" }}>
              <span
                className="shrink-0 inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--amb)", animation: "pulse 1.5s infinite" }}
              />
              <span>Working...</span>
            </div>
          )}

          {/* Completion indicator */}
          <TurnFooter turn={turn} turnEvents={turnEvents} sessionIsRunning={sessionIsRunning} />
        </div>
      )}
    </div>
  );
}

/** Memoized TurnCard — skips re-render when turn content hasn't changed */
export const MemoTurnCard = memo(TurnCard, turnCardAreEqual);
