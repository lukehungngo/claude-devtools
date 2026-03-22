import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentDAG } from "../lib/types";
import { formatCost, formatTokens } from "../lib/cost";

const typeColors: Record<string, string> = {
  main: "#3b82f6",
  Explore: "#06b6d4",
  Plan: "#eab308",
  "general-purpose": "#8b5cf6",
  unknown: "#6b7280",
};

export function AgentFlowDAG({ dag }: { dag: AgentDAG }) {
  const nodes: Node[] = dag.nodes.map((n, i) => ({
    id: n.id,
    position: {
      x: n.id === "main" ? 300 : 150 + (i - 1) * 300,
      y: n.id === "main" ? 50 : 250,
    },
    data: {
      label: (
        <div className="text-left">
          <div className="font-bold text-sm">{n.type}</div>
          <div className="text-xs opacity-70 truncate max-w-48">
            {n.description}
          </div>
          <div className="text-xs mt-1 opacity-60">
            {formatTokens(n.tokenUsage.inputTokens + n.tokenUsage.outputTokens)}{" "}
            tokens · {formatCost(n.tokenUsage.totalCost)}
          </div>
          <div className="text-xs opacity-60">{n.toolCalls} tool calls</div>
        </div>
      ),
    },
    style: {
      background: "#1f2937",
      border: `2px solid ${typeColors[n.type] || typeColors.unknown}`,
      borderRadius: "8px",
      padding: "12px",
      color: "white",
      minWidth: "200px",
    },
  }));

  const edges: Edge[] = dag.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: "#4b5563" },
  }));

  return (
    <div className="h-full w-full" style={{ minHeight: "500px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#374151" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
