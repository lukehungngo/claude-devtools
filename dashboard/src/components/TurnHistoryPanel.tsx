import { memo, useCallback, useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import type { TurnSnapshot } from "../lib/turnSnapshot";
import { getEventsForTurn } from "../lib/turnSnapshot";
import { getAgentStatus } from "../lib/agentStatus";
import type { AgentStatus } from "../lib/agentStatus";
import type { SessionEvent } from "../lib/types";
import { formatCost, formatDuration } from "../lib/cost";

// ─── Props ──────────────────────────────────────────────────────────

export interface TurnHistoryPanelProps {
  turns: TurnSnapshot[];
  /**
   * Shared allEvents array. Used to derive per-turn main-agent status via
   * `getAgentStatus`. Defaults to `[]` so existing callers that don't thread
   * events through yet degrade to an empty stream (no signals).
   */
  allEvents?: SessionEvent[];
  /**
   * Server-side session.isRunning. When explicitly `false`, turns without a
   * terminal signal render as `indeterminate` (grey static dot, honest truth
   * about closed sessions) rather than "running" (pulsing forever). When
   * undefined, we assume active to preserve legacy behavior for callers that
   * don't thread it through yet.
   *
   * PREFERRED SOURCE: `metrics.session.isRunning` from the current session's
   * metrics — this is per-session authoritative (SDK session_state_changed
   * for SSE, mtime heuristic for JSONL). Do NOT wire this from raw WebSocket
   * connectivity (`isLive`): that flag is true for the whole UI while the WS
   * is connected, including when viewing historical closed sessions, and
   * would defeat the point of the indeterminate state.
   */
  sessionIsRunning?: boolean;
  activeTurnIndex: number | null;
  onSelectTurn: (index: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}

// ─── Relative time helper ───────────────────────────────────────────

export function relativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now - then;
  if (diffMs < 60_000) return "now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diffMs / 3_600_000);
  return `${hours}h`;
}

// ─── Turn Item (memoized) ───────────────────────────────────────────

interface TurnItemProps {
  turn: TurnSnapshot;
  /** Pre-computed 3-state status derived from main's predicate on this turn's events. */
  status: AgentStatus;
  index: number;
  isActive: boolean;
  onClick: (index: number) => void;
}

function turnItemComparator(prev: TurnItemProps, next: TurnItemProps): boolean {
  return (
    prev.turn === next.turn &&
    prev.status === next.status &&
    prev.index === next.index &&
    prev.isActive === next.isActive &&
    prev.onClick === next.onClick
  );
}

const TurnItem = memo(function TurnItem({ turn, status, index, isActive, onClick }: TurnItemProps) {
  const handleClick = useCallback(() => onClick(index), [onClick, index]);

  const hasMultipleAgents = turn.agents.length > 1;

  return (
    <div
      data-testid={`turn-item-${index}`}
      data-turn-panel-index={index}
      data-status={status}
      onClick={handleClick}
      className={[
        "px-[10px] py-2 border-b border-dt-border cursor-pointer border-l-[3px] transition-all duration-[120ms]",
        isActive
          ? "bg-[var(--acc-bg)] border-l-dt-accent"
          : "border-l-transparent hover:bg-dt-bg1",
      ].join(" ")}
    >
      {/* Row 1 */}
      <div className="flex items-center gap-[5px] mb-[3px]">
        <span
          className={[
            "font-mono text-[10px] font-semibold",
            isActive ? "text-dt-accent" : "text-dt-text1",
          ].join(" ")}
        >
          T{turn.turnNumber}
        </span>
        <span className="text-[11px] text-dt-text0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {turn.promptText}
        </span>
        <span className="text-[9px] text-dt-text2 font-mono shrink-0">
          {relativeTime(turn.startTime)}
        </span>
        {/* Three-state indicator — one render branch per state, honest. */}
        {status === "running" && (
          <span
            data-testid="running-dot"
            className="w-[5px] h-[5px] rounded-full bg-dt-green ml-1"
            style={{ animation: "pulse 1.5s ease-in-out infinite" }}
          />
        )}
        {status === "indeterminate" && (
          <span
            data-testid="indeterminate-dot"
            className="w-[5px] h-[5px] rounded-full bg-dt-text2 ml-1"
            title="Session ended without a completion signal"
          />
        )}
        {/* `completed` intentionally renders no dot — the row is its own marker. */}
      </div>

      {/* Row 2 */}
      <div className="flex items-center gap-[3px]">
        {hasMultipleAgents && (
          <div data-testid="agent-dots" className="flex gap-[2px]">
            {turn.agents.map((agent) => (
              <span
                key={agent.agentId}
                className="w-[14px] h-[14px] rounded-[3px] text-[7px] font-semibold flex items-center justify-center"
                style={{
                  background: `var(--span-${agent.agentType.toLowerCase().slice(0, 3)}, var(--bg-h))`,
                  color: `var(--span-${agent.agentType.toLowerCase().slice(0, 3)}-t, var(--t1))`,
                }}
                title={agent.displayName}
              >
                {agent.displayName.slice(0, 2)}
              </span>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-[6px] text-[9px] font-mono text-dt-text2">
          <span className="text-dt-yellow">{formatCost(turn.cost)}</span>
          {turn.durationMs !== null && (
            <span>{formatDuration(turn.durationMs)}</span>
          )}
        </div>
      </div>
    </div>
  );
}, turnItemComparator);

// ─── Panel ──────────────────────────────────────────────────────────

const EMPTY_EVENTS: SessionEvent[] = [];

function TurnHistoryPanelInner({
  turns,
  allEvents = EMPTY_EVENTS,
  sessionIsRunning,
  activeTurnIndex,
  onSelectTurn,
  isOpen,
  onToggle,
}: TurnHistoryPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleSelectTurn = useCallback(
    (index: number) => onSelectTurn(index),
    [onSelectTurn],
  );

  // Auto-scroll active turn into view when activeTurnIndex changes (e.g. topbar stepper)
  useEffect(() => {
    if (activeTurnIndex == null || !bodyRef.current) return;
    const el = bodyRef.current.querySelector(
      `[data-turn-panel-index="${activeTurnIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeTurnIndex]);

  // Treat undefined as active (legacy caller preservation). When the value
  // is explicitly `false`, closed-session turns render as `indeterminate`.
  const sessionIsActive = sessionIsRunning !== false;

  return (
    <div
      className={[
        "flex flex-col transition-[width,min-width] duration-[250ms] ease-in-out border-r border-dt-border shrink-0",
        isOpen
          ? "w-[260px] min-w-[260px]"
          : "w-0 min-w-0 border-r-0 overflow-hidden",
      ].join(" ")}
    >
      {/* Header */}
      <div
        className="flex items-center px-2 shrink-0 h-[30px] bg-dt-bg0 border-b border-dt-border"
      >
        <span className="text-[10px] uppercase tracking-[0.7px] text-dt-text2 flex-1">
          TURN HISTORY
        </span>
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-[20px] h-[20px] bg-transparent border-none text-dt-text2 rounded cursor-pointer hover:bg-dt-bg1 hover:text-dt-text0"
          aria-label="Toggle turn history"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto dt-scrollbar">
        {turns.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
            No turns yet
          </div>
        ) : (
          turns.map((_, i) => {
            const ri = turns.length - 1 - i;
            const turn = turns[ri];
            // Compute the 3-state status once in the parent; TurnItem memoizes
            // on the scalar `status` value rather than recomputing per render.
            const turnEvents = getEventsForTurn(turn, allEvents);
            const status = getAgentStatus("main", turnEvents, sessionIsActive);
            return (
              <TurnItem
                key={turn.turnNumber}
                turn={turn}
                status={status}
                index={ri}
                isActive={activeTurnIndex === ri}
                onClick={handleSelectTurn}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export const TurnHistoryPanel = memo(TurnHistoryPanelInner);
