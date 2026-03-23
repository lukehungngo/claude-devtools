import { useState } from "react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type {
  SessionEvent,
  AssistantEvent,
  ContentItem,
} from "../../lib/types";
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
  const isRunning = turn.status === "running";
  const responseContent = extractResponseContent(turn.events);
  const canExpandPrompt = turn.promptText.length > 100;

  return (
    <div
      className={`conv-turn ${collapsed ? "collapsed" : ""} ${isHighlighted ? "highlighted" : ""} rounded-dt border border-dt-border mb-2 overflow-hidden transition-colors ${
        isHighlighted ? "bg-dt-accent-dim" : "bg-dt-bg2"
      }`}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none"
      >
        {/* Expand icon */}
        <span
          className="text-sm text-dt-text2 transition-transform shrink-0"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
        >
          {"\u25BC"}
        </span>

        {/* Turn label */}
        <span className="text-sm font-bold text-dt-accent uppercase tracking-[0.5px] shrink-0">
          PROMPT {"\u00B7"} TURN {turn.turnNumber}
        </span>

        <div className="flex-1" />

        {/* Status dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? "bg-dt-accent animate-pulse-opacity" : "bg-dt-green"}`}
        />

        {/* Time */}
        <span className="text-sm text-dt-text2 font-mono shrink-0">
          {formatTime(turn.startTime)}
        </span>

        {/* Cost */}
        {turn.cost > 0 && (
          <span className="text-sm text-dt-text2 font-mono shrink-0">
            {formatCost(turn.cost)}
          </span>
        )}
      </div>

      {/* User prompt */}
      <div
        className={`flex gap-2 pr-4 pb-3 pl-9 ${promptExpanded ? "items-start" : "items-center"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-bold text-dt-accent uppercase tracking-[0.4px] shrink-0">
          USER PROMPT
        </span>
        <span
          className="flex-1 min-w-0 text-lg text-dt-text1"
          style={{
            overflow: "hidden",
            textOverflow: promptExpanded ? "clip" : "ellipsis",
            whiteSpace: promptExpanded ? "normal" : "nowrap",
            wordBreak: promptExpanded ? "break-word" : "normal",
            lineHeight: promptExpanded ? 1.35 : 1.2,
          }}
        >
          {turn.promptText}
        </span>
        {canExpandPrompt && (
          <button
            type="button"
            onClick={() => setPromptExpanded((prev) => !prev)}
            className="shrink-0 text-xs font-semibold text-dt-accent bg-transparent border-none cursor-pointer p-0 leading-none"
          >
            {promptExpanded ? "less" : "more"}
          </button>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="conv-turn-body pr-4 pb-3 pl-9">
          {/* Agent pills */}
          <AgentPills agents={turn.agents} onPillClick={onAgentPillClick} />

          {/* Tool entries */}
          <ToolEntries events={turn.events} />

          {/* Response content */}
          {responseContent.map((item, i) =>
            item.type === "thinking" && "thinking" in item ? (
              <ThinkingBlock key={`thinking-${i}`} content={item} />
            ) : item.type === "text" && "text" in item ? (
              <ResponseBlock key={`text-${i}`} text={item.text} />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
