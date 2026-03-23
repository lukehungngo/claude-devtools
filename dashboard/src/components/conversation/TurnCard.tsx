import { useState, useRef, useEffect } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent, ContentItem } from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { formatCost } from "../../lib/cost";
import { formatTime } from "../../lib/formatTime";
import { AgentPills } from "./AgentPills";
import { ThinkingBlock } from "../viewer/ThinkingBlock";
import { ResponseBlock } from "../viewer/ResponseBlock";
import { ToolEntries } from "./ToolEntries";

interface TurnCardProps {
  turn: TurnSnapshot;
  isHighlighted?: boolean;
  onAgentPillClick?: (agentId: string) => void;
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

// ─── TurnCard ────────────────────────────────────────────────────────

export function TurnCard({
  turn,
  isHighlighted = false,
  onAgentPillClick,
}: TurnCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const promptRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      const el = promptRef.current;
      if (el && !promptExpanded) {
        setIsOverflowing(el.scrollWidth > el.clientWidth);
      }
    };

    // Check overflow on mount or when dependencies change
    checkOverflow();

    // Add resize listener
    const handleResize = () => {
      checkOverflow();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [turn.promptText, promptExpanded]);

  const isRunning = turn.status === "running";
  const responseContent = extractResponseContent(turn.events);

  return (
    <div
      className={`conv-turn ${collapsed ? "collapsed" : ""} ${isHighlighted ? "highlighted" : ""}`}
      style={{
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: isHighlighted
          ? "var(--accent-dim)"
          : "var(--bg-2)",
        marginBottom: "8px",
        overflow: "hidden",
        transition: "background 0.15s",
      }}
    >
      {/* Header */}
      <div
        className="conv-turn-header"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Expand icon */}
        <span
          style={{
            fontSize: "10px",
            color: "var(--text-2)",
            transition: "transform 0.15s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        >
          {"\u25BC"}
        </span>

        {/* Turn label */}
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            flexShrink: 0,
          }}
        >
          PROMPT {"\u00B7"} TURN {turn.turnNumber}
        </span>

        {/* Prompt preview */}
        <span
          ref={promptRef}
          style={{
            flex: 1,
            fontSize: "11px",
            color: "var(--text-1)",
            ...(promptExpanded
              ? { whiteSpace: "pre-wrap", overflow: "visible", wordBreak: "break-word" }
              : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (turn.promptText) setPromptExpanded((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && turn.promptText) {
              e.stopPropagation();
              e.preventDefault();
              setPromptExpanded((prev) => !prev);
            }
          }}
          {...(turn.promptText
            ? {
                role: "button",
                tabIndex: 0,
                "aria-expanded": promptExpanded,
                "aria-label": promptExpanded
                  ? "Collapse prompt text"
                  : "Expand prompt text",
              }
            : {})}
        >
          {turn.promptText}
          {turn.promptText && (isOverflowing || promptExpanded) && (
            <span
              style={{
                fontSize: "9px",
                color: "var(--text-2)",
                marginLeft: "4px",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {promptExpanded ? "(less)" : "(more)"}
            </span>
          )}
        </span>

        {/* Status dot */}
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: isRunning ? "var(--accent)" : "var(--green)",
            animation: isRunning ? "pulse 1.2s ease-in-out infinite" : "none",
            flexShrink: 0,
          }}
        />

        {/* Time */}
        <span
          style={{
            fontSize: "10px",
            color: "var(--text-2)",
            fontFamily: "var(--font)",
            flexShrink: 0,
          }}
        >
          {formatTime(turn.startTime)}
        </span>

        {/* Cost */}
        {turn.cost > 0 && (
          <span
            style={{
              fontSize: "10px",
              color: "var(--text-2)",
              fontFamily: "var(--font)",
              flexShrink: 0,
            }}
          >
            {formatCost(turn.cost)}
          </span>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div
          className="conv-turn-body"
          style={{
            padding: "0 12px 10px 30px",
          }}
        >
          {/* Agent pills */}
          <AgentPills
            agents={turn.agents}
            onPillClick={onAgentPillClick}
          />

          {/* Tool entries */}
          <ToolEntries events={turn.events} />

          {/* Response content */}
          {responseContent.map((item, i) =>
            item.type === "thinking" && "thinking" in item ? (
              <ThinkingBlock key={`thinking-${i}`} content={item} />
            ) : item.type === "text" && "text" in item ? (
              <ResponseBlock key={`text-${i}`} text={item.text} />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
