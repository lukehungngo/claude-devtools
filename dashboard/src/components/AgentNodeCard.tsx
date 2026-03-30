import { useState, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentNode } from "../lib/types";
import { formatCost, formatTokens, formatDuration } from "../lib/cost";
import { getAgentColor } from "../lib/agentColors";

/** Status dot color */
const statusDotColors: Record<string, string> = {
  active: "var(--cyan)",
  completed: "var(--green)",
  error: "var(--red)",
};

function computeNodeDuration(node: AgentNode): number | null {
  if (!node.startTime) return null;
  const start = new Date(node.startTime).getTime();
  const end = node.endTime ? new Date(node.endTime).getTime() : Date.now();
  return end - start;
}


export const AgentNodeCard = memo(function AgentNodeCard({ data }: NodeProps) {
  const node = data.agent as AgentNode;
  const borderColor = getAgentColor(node.type);
  const dotColor = statusDotColors[node.status] || "var(--text-2)";
  const isRunning = node.status === "active";
  const isMain = node.type === "main";
  const isSelected = data.selected as boolean | undefined;
  const isFrozen = data.frozen as boolean | undefined;
  const [hovered, setHovered] = useState(false);

  const duration = computeNodeDuration(node);

  return (
    <div
      className="bg-dt-bg2 rounded-dt px-3 py-2 min-w-30 max-w-40 cursor-pointer transition-all duration-200 relative shadow-dt-sm hover:shadow-dt-md"
      style={{
        border: `1.5px solid ${borderColor}`,
        filter: isMain ? `drop-shadow(0 0 8px ${borderColor})` : undefined,
        outline: isSelected ? `2px solid ${borderColor}` : undefined,
        outlineOffset: isSelected ? "3px" : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover tooltip */}
      {hovered && (
        <div
          className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 bg-dt-bg1/95 backdrop-blur-[12px] border border-dt-border-active rounded-dt-md px-3 py-2.5 text-xxs font-mono text-dt-text1 whitespace-nowrap z-50 pointer-events-auto shadow-dt-lg leading-[1.6]"
          style={{
            pointerEvents: "auto",
          }}
        >
          <div className="font-bold text-dt-text0 mb-0.5">
            {node.type} {node.id !== "main" ? `(${node.id.slice(0, 8)})` : ""}
          </div>
          {node.startTime && (
            <div>Spawn: {new Date(node.startTime).toLocaleTimeString("en-US", { hour12: false })}</div>
          )}
          {duration !== null && (
            <div>Duration: {formatDuration(duration)}</div>
          )}
          <div>In: {formatTokens(node.tokenUsage.inputTokens)} / Out: {formatTokens(node.tokenUsage.outputTokens)}</div>
          <div>Cost: {formatCost(node.tokenUsage.totalCost)}</div>
          <div>Tools: {node.toolCalls}{node.mcpToolCalls > 0 ? ` (${node.mcpToolCalls} MCP)` : ""}</div>
          <div>Status: {node.status}</div>
          {(data.onViewInLog as ((id: string) => void) | undefined) && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                (data.onViewInLog as (id: string) => void)(node.id);
              }}
              style={{
                marginTop: "4px",
                paddingTop: "4px",
                borderTop: "1px solid var(--border)",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "10px",
                fontWeight: 600,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.textDecoration = "underline";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.textDecoration = "none";
              }}
            >
              View in Agent Log \u2192
            </div>
          )}
        </div>
      )}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "var(--border-active)", width: 6, height: 6 }}
      />

      {/* Row 1: status dot + label */}
      <div className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning && !isFrozen ? "animate-pulse-opacity" : ""}`}
          style={{
            background: dotColor,
          }}
        />
        <span className="text-xxs font-semibold text-dt-text0 font-sans whitespace-nowrap overflow-hidden text-ellipsis">
          {node.type}
        </span>
      </div>

      {/* Row 2: description */}
      {node.description && (
        <div className="text-3xs text-dt-text2 uppercase tracking-[0.5px] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
          {node.description}
        </div>
      )}

      {/* Row 3: status text */}
      <div className="text-3xs mt-0.5" style={{ color: dotColor }}>
        {node.status === "completed"
          ? "\u2713 completed"
          : node.status === "active"
            ? "\u25CF running"
            : "\u2717 error"}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "var(--border-active)", width: 6, height: 6 }}
      />
    </div>
  );
}, (prev, next) => {
  const prevNode = prev.data.agent as AgentNode;
  const nextNode = next.data.agent as AgentNode;
  return (
    prevNode.status === nextNode.status &&
    prevNode.type === nextNode.type &&
    prevNode.tokenUsage.totalCost === nextNode.tokenUsage.totalCost &&
    prevNode.toolCalls === nextNode.toolCalls &&
    prev.data.selected === next.data.selected
  );
});
