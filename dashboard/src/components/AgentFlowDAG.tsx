import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import type { AgentDAG } from "../lib/types";
import { formatCost, formatTokens } from "../lib/cost";
import { AgentNodeCard } from "./AgentNodeCard";

const nodeTypes = { agentCard: AgentNodeCard };

const NODE_WIDTH = 140;
const NODE_HEIGHT = 56;

function getLayoutedElements(dag: AgentDAG, selectedAgent: string | null, frozen = false, onViewInLog?: (agentId: string) => void) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  for (const node of dag.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of dag.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = dag.nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "agentCard",
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: { agent: n, selected: n.id === selectedAgent, frozen, onViewInLog, invocationCount: Math.max(1, Math.ceil(n.toolCalls / 5)) },
    };
  });

  const edges: Edge[] = dag.edges.map((e, i) => {
    const targetNode = dag.nodes.find((n) => n.id === e.target);
    const isActive = targetNode?.status === "active";
    return {
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      animated: frozen ? false : isActive,
      style: {
        stroke: isActive
          ? "var(--accent)"
          : "var(--border-active)",
        strokeWidth: 1.5,
        strokeDasharray: frozen ? undefined : (isActive ? "5 3" : undefined),
      },
      markerEnd: {
        type: "arrowclosed" as const,
        color: isActive ? "var(--accent)" : "var(--border-active)",
        width: 16,
        height: 12,
      },
    };
  });

  return { nodes, edges };
}

interface GraphInnerProps {
  dag: AgentDAG;
  selectedAgent: string | null;
  onSelectAgent?: (agentId: string) => void;
  frozen?: boolean;
  onViewInLog?: (agentId: string) => void;
}

function GraphInner({ dag, selectedAgent, onSelectAgent, frozen = false, onViewInLog }: GraphInnerProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const { nodes, edges } = useMemo(
    () => getLayoutedElements(dag, selectedAgent, frozen, onViewInLog),
    [dag, selectedAgent, frozen, onViewInLog]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectAgent?.(node.id);
    },
    [onSelectAgent]
  );

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);

  // Compute stats
  const totalAgents = dag.nodes.length;
  const runningCount = dag.nodes.filter((n) => n.status === "active").length;
  const completedCount = dag.nodes.filter(
    (n) => n.status === "completed"
  ).length;
  const totalCost = dag.nodes.reduce(
    (sum, n) => sum + n.tokenUsage.totalCost,
    0
  );
  const totalTokens = dag.nodes.reduce(
    (sum, n) =>
      sum + n.tokenUsage.inputTokens + n.tokenUsage.outputTokens,
    0
  );

  const defaultEdgeOptions: DefaultEdgeOptions = {
    style: { stroke: "var(--border-active)", strokeWidth: 1.5 },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-2)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--text-2)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ opacity: 0.6 }}
          >
            <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0zm14.28 2.53l-5.25 5.25a.75.75 0 01-1.06 0L7 7.06 4.28 9.78a.75.75 0 01-1.06-1.06l3.25-3.25a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06z" />
          </svg>
          Agent Graph
          <span
            style={{
              fontSize: "9px",
              padding: "1px 5px",
              borderRadius: "8px",
              fontWeight: 600,
              background: frozen ? "var(--bg-4)" : "var(--accent-dim)",
              color: frozen ? "var(--text-2)" : "var(--accent)",
            }}
          >
            {frozen ? "snapshot" : "real-time"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={handleFitView}
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-2)",
              cursor: "pointer",
              border: "none",
              background: "transparent",
              transition: "all 0.15s",
            }}
            title="Fit to view"
          >
            &#x22A1;
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 50% 50%, var(--bg-2) 0%, var(--bg-1) 100%)",
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          proOptions={{ hideAttribution: true }}
          onNodeClick={handleNodeClick}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Graph toolbar (bottom-left) */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 12,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            zIndex: 5,
          }}
        >
          {[
            { label: "+", title: "Zoom in", action: () => zoomIn() },
            {
              label: "\u2212",
              title: "Zoom out",
              action: () => zoomOut(),
            },
            {
              label: "\u22A1",
              title: "Fit to view",
              action: handleFitView,
            },
          ].map((btn) => (
            <button
              key={btn.title}
              onClick={btn.action}
              title={btn.title}
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-2)",
                cursor: "pointer",
                fontSize: "14px",
                transition: "all 0.15s",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Legend (top-right) */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            display: "flex",
            gap: "12px",
            fontSize: "10px",
            color: "var(--text-2)",
            zIndex: 5,
          }}
        >
          {([
            ["Main", "var(--accent)"],
            ["Explore", "var(--cyan)"],
            ["Plan", "var(--yellow)"],
            ["General", "var(--green)"],
          ] as const).map(([name, color]) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "2px",
                  background: color,
                }}
              />
              {name}
            </div>
          ))}
        </div>

        {/* Stats bar (bottom overlay) */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 36,
            display: "flex",
            alignItems: "center",
            gap: "24px",
            padding: "0 15px",
            background: "var(--bg-1)",
            opacity: 0.9,
            borderTop: "1px solid var(--border)",
            fontFamily: "var(--font)",
            fontSize: "10px",
            color: "var(--text-2)",
            zIndex: 5,
          }}
        >
          <span>
            Agents:{" "}
            <span style={{ color: "var(--text-0)" }}>{totalAgents}</span>
          </span>
          <span>
            Running:{" "}
            <span style={{ color: "var(--cyan)" }}>{runningCount}</span>
          </span>
          <span>
            Completed:{" "}
            <span style={{ color: "var(--green)" }}>{completedCount}</span>
          </span>
          <span>
            Total Cost:{" "}
            <span style={{ color: "var(--text-0)" }}>
              {formatCost(totalCost)}
            </span>
          </span>
          <span>
            Tokens:{" "}
            <span style={{ color: "var(--text-0)" }}>
              {formatTokens(totalTokens)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  dag: AgentDAG;
  selectedAgent: string | null;
  onSelectAgent?: (agentId: string) => void;
  frozen?: boolean;
  onViewInLog?: (agentId: string) => void;
}

export function AgentFlowDAG({ dag, selectedAgent, onSelectAgent, frozen, onViewInLog }: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner
        dag={dag}
        selectedAgent={selectedAgent}
        onSelectAgent={onSelectAgent}
        frozen={frozen}
        onViewInLog={onViewInLog}
      />
    </ReactFlowProvider>
  );
}
