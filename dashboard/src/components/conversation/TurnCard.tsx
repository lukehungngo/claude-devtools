import { useState, useEffect, memo } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type {
  SessionEvent,
  AssistantEvent,
  ContentItem,
} from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { formatDuration } from "../../lib/cost";
import { AgentPills } from "./AgentPills";
import { ThinkingBlock } from "../viewer/ThinkingBlock";
import { ResponseBlock } from "../viewer/ResponseBlock";
import { ToolEntries } from "./ToolEntries";

interface TurnCardProps {
  turn: TurnSnapshot;
  isHighlighted?: boolean;
  onAgentPillClick?: (agentId: string) => void;
  onTurnClick?: () => void;
}

// ─── Content renderers ───────────────────────────────────────────────

function extractResponseContent(events: SessionEvent[]): ContentItem[] {
  const items: ContentItem[] = [];
  for (const event of events) {
    if (event.type === "assistant") {
      const asst = event as AssistantEvent;
      for (const content of normalizeContent(asst.message?.content)) {
        if (content.type === "text" || content.type === "thinking") {
          items.push(content);
        }
      }
    }
  }
  return items;
}

// ─── TurnFooter (elapsed / completed duration) ─────────────────────

function TurnFooter({ turn }: { turn: TurnSnapshot }) {
  const isStreaming = turn.status === "running";
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
    prev.turn.events.length === next.turn.events.length &&
    prev.turn.durationMs === next.turn.durationMs &&
    prev.turn.cost === next.turn.cost &&
    prev.turn.agents.length === next.turn.agents.length &&
    prev.isHighlighted === next.isHighlighted &&
    prev.onAgentPillClick === next.onAgentPillClick &&
    prev.onTurnClick === next.onTurnClick
  );
}

export function TurnCard({
  turn,
  isHighlighted = false,
  onAgentPillClick,
  onTurnClick,
}: TurnCardProps) {
  const isRunning = turn.status === "running";
  const responseContent = extractResponseContent(turn.events);

  return (
    <div
      className={`conv-turn ${isHighlighted ? "highlighted" : ""}`}
      onClick={onTurnClick}
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* ── User message ── */}
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
            {turn.promptText}
          </div>
        </div>
      </div>

      {/* ── Claude message ── */}
      {(responseContent.length > 0 || turn.events.length > 0) && (
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

            {/* Response text + tool groups interleaved */}
            {responseContent.map((item, i) =>
              item.type === "thinking" && "thinking" in item ? (
                <ThinkingBlock key={`thinking-${i}`} content={item} />
              ) : item.type === "text" && "text" in item ? (
                <div
                  key={`text-${i}`}
                  className="msg-text"
                  style={{ fontSize: 13, color: "var(--t1)", lineHeight: 1.65, marginTop: i > 0 ? 10 : 0 }}
                >
                  <ResponseBlock text={item.text} />
                </div>
              ) : null,
            )}

            {/* Tool entries (grouped card) */}
            <ToolEntries events={turn.events} />

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
            <TurnFooter turn={turn} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Memoized TurnCard — skips re-render when turn content hasn't changed */
export const MemoTurnCard = memo(TurnCard, turnCardAreEqual);
