import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentNode } from "../lib/types";
import { formatCost, formatTokens, formatDuration } from "../lib/cost";

/** Color mapping by agent type for border */
const typeBorderColors: Record<string, string> = {
  main: "var(--accent)",
  Explore: "var(--cyan)",
  Plan: "var(--yellow)",
  "general-purpose": "var(--green)",
  General: "var(--green)",
};

/** Status dot color */
const statusDotColors: Record<string, string> = {
  active: "var(--cyan)",
  completed: "var(--green)",
  error: "var(--red)",
};

function getBorderColor(type: string): string {
  return typeBorderColors[type] || "var(--border-active)";
}

function computeNodeDuration(node: AgentNode): number | null {
  if (!node.startTime) return null;
  const start = new Date(node.startTime).getTime();
  const end = node.endTime ? new Date(node.endTime).getTime() : Date.now();
  return end - start;
}


/** Generate segmented activity ring for multi-invocation agents */
function ActivityRing({ segments, color, size }: { segments: number; color: string; size: number }) {
  if (segments <= 1) return null;
  const maxSegments = Math.min(segments, 12); // Cap visual segments
  const radius = size / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const gapAngle = 8; // degrees gap between segments
  const totalGapDeg = gapAngle * maxSegments;
  const segmentDeg = (360 - totalGapDeg) / maxSegments;
  const segmentLen = (segmentDeg / 360) * circumference;
  const gapLen = (gapAngle / 360) * circumference;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: "absolute",
        top: -3,
        left: -3,
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: maxSegments }).map((_, i) => {
        const rotation = i * (segmentDeg + gapAngle) - 90;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray={`${segmentLen} ${circumference - segmentLen}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            opacity={0.7}
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
          />
        );
      })}
    </svg>
  );
}

const NODE_RING_SIZE = 170; // slightly larger than max node width + padding

export function AgentNodeCard({ data }: NodeProps) {
  const node = data.agent as AgentNode;
  const borderColor = getBorderColor(node.type);
  const dotColor = statusDotColors[node.status] || "var(--text-2)";
  const isRunning = node.status === "active";
  const isMain = node.type === "main";
  const isSelected = data.selected as boolean | undefined;
  const isFrozen = data.frozen as boolean | undefined;
  const invocationCount = (data.invocationCount as number) || 1;
  const [hovered, setHovered] = useState(false);

  const duration = computeNodeDuration(node);

  return (
    <div
      style={{
        background: "var(--bg-3)",
        border: `1.5px solid ${borderColor}`,
        borderRadius: "6px",
        padding: "6px 10px",
        minWidth: "120px",
        maxWidth: "160px",
        cursor: "pointer",
        transition: "all 0.2s",
        filter: isMain ? `drop-shadow(0 0 6px ${borderColor})` : undefined,
        outline: isSelected ? `2px solid ${borderColor}` : undefined,
        outlineOffset: isSelected ? "2px" : undefined,
        position: "relative",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Activity ring for multi-invocation agents */}
      {invocationCount > 1 && (
        <ActivityRing
          segments={invocationCount}
          color={borderColor}
          size={NODE_RING_SIZE}
        />
      )}
      {/* Hover tooltip */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-1)",
            border: "1px solid var(--border-active)",
            borderRadius: "6px",
            padding: "8px 10px",
            fontSize: "10px",
            fontFamily: "var(--font)",
            color: "var(--text-1)",
            whiteSpace: "nowrap",
            zIndex: 50,
            pointerEvents: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--text-0)", marginBottom: "2px" }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
            animation: isRunning && !isFrozen
              ? "pulse-opacity 1.5s ease-in-out infinite"
              : undefined,
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "var(--text-0)",
            fontFamily: "var(--font-sans)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.type}
        </span>
      </div>

      {/* Row 2: description */}
      {node.description && (
        <div
          style={{
            fontSize: "8px",
            color: "var(--text-2)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginTop: "2px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.description}
        </div>
      )}

      {/* Row 3: status text */}
      <div
        style={{
          fontSize: "8px",
          color: dotColor,
          marginTop: "2px",
        }}
      >
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
}
