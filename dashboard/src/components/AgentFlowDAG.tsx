import { useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { getAgentColor, LEGEND_ENTRIES } from "../lib/agentColors";
import "@xyflow/react/dist/style.css";
import type { AgentDAG } from "../lib/types";
import { formatCost, formatTokens } from "../lib/cost";
import { AgentNodeCard } from "./AgentNodeCard";

const nodeTypes = { agentCard: AgentNodeCard };

/** Exported for overflow regression tests (TASK-005) */
export const LEGEND_CONTAINER_CLASS =
  "absolute top-2 left-0 right-0 flex flex-wrap gap-2 px-3 text-sm text-dt-text2 z-[5]";

/** Exported for overflow regression tests (TASK-005) */
export const LEGEND_ITEM_CLASS = "flex items-center gap-1";

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

  // Track the node set fingerprint so we can re-fit when nodes change
  const nodeFingerprint = useMemo(
    () => dag.nodes.map((n) => n.id).sort().join(","),
    [dag.nodes]
  );
  const prevFingerprint = useRef<string | null>(null);

  // Auto-fitView on mount AND when the set of visible nodes changes
  // (turn switch, agents added/removed, initial load)
  useEffect(() => {
    if (prevFingerprint.current === nodeFingerprint) return;
    prevFingerprint.current = nodeFingerprint;
    // Delay to let ReactFlow process new nodes before fitting
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 200);
    return () => clearTimeout(t);
  }, [nodeFingerprint, fitView]);

  // Focus on selected agent node when it changes (e.g., clicking a turn prompt)
  const prevSelectedAgent = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedAgent || selectedAgent === prevSelectedAgent.current) return;
    prevSelectedAgent.current = selectedAgent;
    const node = nodes.find((n) => n.id === selectedAgent);
    if (!node) return;
    const t = setTimeout(() => {
      fitView({ padding: 0.3, duration: 200, nodes: [node] });
    }, 200);
    return () => clearTimeout(t);
  }, [selectedAgent, nodes, fitView]);

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
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dt-border shrink-0 bg-dt-bg2">
        <div className="text-base font-semibold uppercase tracking-[0.5px] text-dt-text2 flex items-center gap-1.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="opacity-60"
          >
            <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0zm14.28 2.53l-5.25 5.25a.75.75 0 01-1.06 0L7 7.06 4.28 9.78a.75.75 0 01-1.06-1.06l3.25-3.25a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06z" />
          </svg>
          Agent Graph
          <span className={`text-xs px-1.25 py-px rounded-full font-semibold ${frozen ? "bg-dt-bg4 text-dt-text2" : "bg-dt-accent-dim text-dt-accent"}`}>
            {frozen ? "snapshot" : "real-time"}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleFitView}
            className="w-6 h-6 flex items-center justify-center rounded-dt-sm text-dt-text2 cursor-pointer border-none bg-transparent transition-all"
            title="Fit to view"
          >
            &#x22A1;
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--bg-2) 0%, var(--bg-1) 100%)",
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          proOptions={{ hideAttribution: true }}
          onNodeClick={handleNodeClick}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Graph toolbar (bottom-left) */}
        <div
          className="absolute bottom-12 left-3 flex flex-col gap-0.5 z-[5]"
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
              className="w-7 h-7 flex items-center justify-center bg-dt-bg3 border border-dt-border rounded-dt-sm text-dt-text2 cursor-pointer text-md transition-all"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Legend (top, full-width scrollable strip) */}
        <div className={LEGEND_CONTAINER_CLASS}>
          {LEGEND_ENTRIES.map(([name, color]) => (
            <div
              key={name}
              className={LEGEND_ITEM_CLASS}
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
          className="absolute bottom-0 left-0 right-0 h-9 flex items-center gap-4 px-3.5 bg-dt-bg1 opacity-90 border-t border-dt-border font-mono text-base text-dt-text2 z-[5]"
        >
          <span>
            Agents:{" "}
            <span className="text-dt-text0">{totalAgents}</span>
          </span>
          <span>
            Running:{" "}
            <span className="text-dt-cyan">{runningCount}</span>
          </span>
          <span>
            Completed:{" "}
            <span className="text-dt-green">{completedCount}</span>
          </span>
          <span>
            Total Cost:{" "}
            <span className="text-dt-text0">
              {formatCost(totalCost)}
            </span>
          </span>
          <span>
            Tokens:{" "}
            <span className="text-dt-text0">
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
