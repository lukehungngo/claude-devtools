import { memo } from "react";
import type { AgentNode } from "../../lib/types";
import { formatTokens } from "../../lib/cost";

export interface AgentGraphNodeProps {
  node: AgentNode;
  /** Pixel offset from the graph container's left edge. */
  x: number;
  /** Pixel offset from the graph container's top edge. */
  y: number;
  selected: boolean;
  running: boolean;
  onSelect: (id: string) => void;
}

/** Status dot color, matching AgentNodeCard semantics. */
const STATUS_DOT: Record<AgentNode["status"], string> = {
  active: "bg-dt-accent",
  completed: "bg-dt-green",
  error: "bg-dt-red",
};

const STATUS_LABEL: Record<AgentNode["status"], string> = {
  active: "● running",
  completed: "✓ completed",
  error: "✗ error",
};

function AgentGraphNodeImpl({ node, x, y, selected, running, onSelect }: AgentGraphNodeProps) {
  const dotClass = STATUS_DOT[node.status];
  const isError = node.status === "error";
  const borderClass =
    node.status === "error"
      ? "border-dt-red"
      : node.status === "active"
        ? "border-dt-accent"
        : "border-dt-border-active";

  return (
    <button
      type="button"
      data-testid={`agent-graph-node-${node.id}`}
      data-running={running ? "true" : "false"}
      data-status={node.status}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelect(node.id)}
      // Dynamic absolute position — the ONLY allowed inline style per fe-guide.
      style={{ left: `${x}px`, top: `${y}px` }}
      className={[
        "absolute z-10 flex flex-col items-start gap-0.5 text-left",
        "bg-dt-bg2 rounded-dt border px-3 py-2 min-w-[7rem] max-w-[11rem]",
        "cursor-pointer transition-all duration-200 shadow-dt-sm hover:shadow-dt-md",
        borderClass,
        selected ? "ring-2 ring-dt-accent ring-offset-2 ring-offset-dt-bg1" : "",
        isError ? "text-dt-red" : "text-dt-text0",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="flex items-center gap-1.5 w-full">
        <span
          className={[
            "w-1.5 h-1.5 rounded-full shrink-0",
            dotClass,
            running ? "animate-pulse" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        />
        <span className="text-xxs font-semibold font-sans whitespace-nowrap overflow-hidden text-ellipsis">
          {node.type}
        </span>
      </span>

      {node.description && (
        <span className="text-3xs text-dt-text2 uppercase tracking-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis w-full">
          {node.description}
        </span>
      )}

      <span className="text-3xs text-dt-text2 font-mono w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {formatTokens(node.tokenUsage.inputTokens)} in · {formatTokens(node.tokenUsage.outputTokens)} out
      </span>

      <span
        className={[
          "text-3xs font-mono",
          node.status === "error" ? "text-dt-red" : node.status === "active" ? "text-dt-accent" : "text-dt-green",
        ].join(" ")}
      >
        {STATUS_LABEL[node.status]}
      </span>
    </button>
  );
}

export const AgentGraphNode = memo(AgentGraphNodeImpl);
