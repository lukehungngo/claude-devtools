import { useState } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { SessionEvent, AssistantEvent, ContentItem } from "../../lib/types";
import { normalizeContent } from "../../lib/normalizeContent";
import { formatCost } from "../../lib/cost";
import { AgentPills } from "./AgentPills";
import { ToolEntries } from "./ToolEntries";

interface TurnCardProps {
  turn: TurnSnapshot;
  isHighlighted?: boolean;
  onAgentPillClick?: (agentId: string) => void;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

// ─── Content renderers ───────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 120);

  return (
    <div
      style={{
        padding: "6px 10px",
        margin: "4px 0",
        borderRadius: "6px",
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        fontSize: "11px",
        fontFamily: "var(--font)",
        color: "var(--text-2)",
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <span style={{ color: "var(--purple)", fontWeight: 600, fontSize: "9px", marginRight: "6px" }}>
        THINKING
      </span>
      {expanded ? (
        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {text}
        </span>
      ) : (
        <span>{preview}{text.length > 120 ? "..." : ""}</span>
      )}
    </div>
  );
}

function ResponseText({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "4px 0",
        fontSize: "12px",
        lineHeight: 1.6,
        color: "var(--text-0)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "var(--font-sans, system-ui)",
      }}
    >
      {text}
    </div>
  );
}

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
          style={{
            flex: 1,
            fontSize: "11px",
            color: "var(--text-1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {turn.promptText}
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
              <ThinkingBlock key={`thinking-${i}`} text={item.thinking} />
            ) : item.type === "text" && "text" in item ? (
              <ResponseText key={`text-${i}`} text={item.text} />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
