import { useMemo, useCallback, useEffect } from "react";
import {
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import { getAgentColor } from "../lib/agentColors";
import "@xyflow/react/dist/style.css";
import type { AgentDAG, AgentEdge as DAGEdge } from "../lib/types";
import { formatCost, formatTokens } from "../lib/cost";
import { AgentNodeCard } from "./AgentNodeCard";

const nodeTypes = { agentCard: AgentNodeCard };

/** Exported for overflow regression tests (TASK-005) */
export const LEGEND_CONTAINER_CLASS =
  "absolute top-2.5 left-0 right-0 flex flex-wrap gap-2.5 px-4 text-xs text-dt-text2 z-[5]";

/** Exported for overflow regression tests (TASK-005) */
export const LEGEND_ITEM_CLASS = "flex items-center gap-1";

export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 56;
export const H_GAP = 20;
export const V_GAP = 60;
export const MAX_PER_ROW = 3;

/**
 * Custom tree layout that wraps children into rows of MAX_PER_ROW.
 * Replaces dagre — our DAG is always a simple tree (main -> children),
 * so grid arithmetic is simpler and avoids the horizontal overflow
 * dagre causes when placing all children in one row.
 *
 * Two-pass algorithm:
 *   Pass 1 (bottom-up): compute subtree width for each node
 *   Pass 2 (top-down): assign positions, centering children under parent
 */
export function computeTreeLayout(
  dagNodes: AgentDAG["nodes"],
  dagEdges: DAGEdge[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (dagNodes.length === 0) return positions;

  // Build adjacency: parent -> children
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const edge of dagEdges) {
    const kids = childrenOf.get(edge.source) || [];
    kids.push(edge.target);
    childrenOf.set(edge.source, kids);
    hasParent.add(edge.target);
  }

  // Find roots (nodes with no incoming edge)
  const roots = dagNodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
  if (roots.length === 0) {
    // Fallback: treat first node as root
    roots.push(dagNodes[0].id);
  }

  // Pass 1: compute subtree width (bottom-up)
  const subtreeWidth = new Map<string, number>();

  function computeWidth(nodeId: string): number {
    const children = childrenOf.get(nodeId) || [];
    if (children.length === 0) {
      const w = NODE_WIDTH;
      subtreeWidth.set(nodeId, w);
      return w;
    }

    // Compute children widths
    const childWidths = children.map((c) => computeWidth(c));

    // Chunk children into rows of MAX_PER_ROW
    const rows: number[][] = [];
    for (let i = 0; i < childWidths.length; i += MAX_PER_ROW) {
      rows.push(childWidths.slice(i, i + MAX_PER_ROW));
    }

    // Width of this subtree = max row width across all rows
    let maxRowWidth = 0;
    for (const row of rows) {
      const rowWidth = row.reduce((sum, w) => sum + w, 0) + (row.length - 1) * H_GAP;
      maxRowWidth = Math.max(maxRowWidth, rowWidth);
    }

    const w = Math.max(NODE_WIDTH, maxRowWidth);
    subtreeWidth.set(nodeId, w);
    return w;
  }

  for (const root of roots) {
    computeWidth(root);
  }

  // Pass 2: assign positions (top-down)
  function placeNode(nodeId: string, cx: number, y: number): void {
    positions.set(nodeId, { x: cx - NODE_WIDTH / 2, y });

    const children = childrenOf.get(nodeId) || [];
    if (children.length === 0) return;

    const childY = y + NODE_HEIGHT + V_GAP;

    // Chunk children into rows
    const rows: string[][] = [];
    for (let i = 0; i < children.length; i += MAX_PER_ROW) {
      rows.push(children.slice(i, i + MAX_PER_ROW));
    }

    let currentY = childY;
    for (const row of rows) {
      // Compute total width of this row using subtree widths
      const rowSubtreeWidths = row.map((c) => subtreeWidth.get(c) || NODE_WIDTH);
      const totalRowWidth = rowSubtreeWidths.reduce((s, w) => s + w, 0) + (row.length - 1) * H_GAP;

      // Center row under parent
      let rowX = cx - totalRowWidth / 2;

      for (let i = 0; i < row.length; i++) {
        const childId = row[i];
        const childSubW = rowSubtreeWidths[i];
        const childCx = rowX + childSubW / 2;
        placeNode(childId, childCx, currentY);
        rowX += childSubW + H_GAP;
      }

      // Advance Y for next row -- find max depth of this row's subtrees
      const maxChildDepth = row.reduce((max, c) => {
        const kids = childrenOf.get(c) || [];
        if (kids.length === 0) return max;
        // Count levels below this child
        let depth = 0;
        let frontier = [...kids];
        while (frontier.length > 0) {
          depth++;
          const next: string[] = [];
          for (const f of frontier) {
            const fk = childrenOf.get(f) || [];
            next.push(...fk);
          }
          frontier = next;
        }
        return Math.max(max, depth);
      }, 0);

      currentY += NODE_HEIGHT + V_GAP + maxChildDepth * (NODE_HEIGHT + V_GAP);
    }
  }

  // Place roots side by side
  const rootWidths = roots.map((r) => subtreeWidth.get(r) || NODE_WIDTH);
  const totalRootWidth = rootWidths.reduce((s, w) => s + w, 0) + (roots.length - 1) * H_GAP;
  let rootX = -totalRootWidth / 2;

  for (let i = 0; i < roots.length; i++) {
    const rootCx = rootX + rootWidths[i] / 2;
    placeNode(roots[i], rootCx, 0);
    rootX += rootWidths[i] + H_GAP;
  }

  return positions;
}

export function getLayoutedElements(
  dag: AgentDAG,
  selectedAgent: string | null,
  frozen = false,
  onViewInLog?: (agentId: string) => void,
  activeTurnAgentIds?: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const positions = computeTreeLayout(dag.nodes, dag.edges);

  const nodes: Node[] = dag.nodes.map((n) => {
    const pos = positions.get(n.id) || { x: 0, y: 0 };
    const isDimmed = activeTurnAgentIds !== undefined && !activeTurnAgentIds.has(n.id);
    return {
      id: n.id,
      type: "agentCard",
      position: { x: pos.x, y: pos.y },
      data: { agent: n, selected: n.id === selectedAgent, frozen, onViewInLog, invocationCount: Math.max(1, Math.ceil(n.toolCalls / 5)) },
      ...(isDimmed ? { style: { opacity: 0.35 } } : {}),
    };
  });

  const edges: Edge[] = dag.edges.map((e, i) => {
    const targetNode = dag.nodes.find((n) => n.id === e.target);
    const isActive = targetNode?.status === "active";
    const isEdgeDimmed = activeTurnAgentIds !== undefined &&
      !activeTurnAgentIds.has(e.source) && !activeTurnAgentIds.has(e.target);

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
        ...(isEdgeDimmed ? { opacity: 0.2 } : {}),
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

interface Props {
  dag: AgentDAG;
  selectedAgent: string | null;
  onSelectAgent?: (agentId: string) => void;
  frozen?: boolean;
  onViewInLog?: (agentId: string) => void;
  activeTurnAgentIds?: Set<string>;
}

function GraphInner({ dag, selectedAgent, onSelectAgent, frozen = false, onViewInLog, activeTurnAgentIds }: Props) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Compute layout + build ReactFlow elements
  const { nodes, edges } = useMemo(
    () => getLayoutedElements(dag, selectedAgent, frozen, onViewInLog, activeTurnAgentIds),
    [dag, selectedAgent, frozen, onViewInLog, activeTurnAgentIds]
  );

  // Re-fit when node set changes (agents added/removed during session)
  const nodeIds = useMemo(() => dag.nodes.map((n) => n.id).sort().join(","), [dag.nodes]);
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 50);
    return () => clearTimeout(timer);
  }, [nodeIds, fitView]);

  // Focus on selected agent
  useEffect(() => {
    if (!selectedAgent) return;
    const timer = setTimeout(() => {
      fitView({ padding: 0.3, duration: 200, nodes: [{ id: selectedAgent }] });
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedAgent, fitView]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onSelectAgent?.(node.id),
    [onSelectAgent]
  );

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);

  // Compute stats
  const totalAgents = dag.nodes.length;
  const runningCount = dag.nodes.filter((n) => n.status === "active").length;
  const completedCount = dag.nodes.filter((n) => n.status === "completed").length;
  const totalCost = dag.nodes.reduce((sum, n) => sum + n.tokenUsage.totalCost, 0);
  const totalTokens = dag.nodes.reduce(
    (sum, n) => sum + n.tokenUsage.inputTokens + n.tokenUsage.outputTokens,
    0
  );

  // Build legend from actual agents in the DAG
  const legendEntries = useMemo(() => {
    const seen = new Set<string>();
    const entries: [string, string][] = [];
    for (const node of dag.nodes) {
      const label = node.type.charAt(0).toUpperCase() + node.type.slice(1);
      if (seen.has(node.type)) continue;
      seen.add(node.type);
      entries.push([label, getAgentColor(node.type)]);
    }
    return entries;
  }, [dag.nodes]);

  const defaultEdgeOptions: DefaultEdgeOptions = {
    style: { stroke: "var(--border-active)", strokeWidth: 1.5 },
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dt-border shrink-0 bg-dt-bg2/80">
        <div className="text-sm font-semibold uppercase tracking-[0.5px] text-dt-text2 flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="opacity-50"
          >
            <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0zm14.28 2.53l-5.25 5.25a.75.75 0 01-1.06 0L7 7.06 4.28 9.78a.75.75 0 01-1.06-1.06l3.25-3.25a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06z" />
          </svg>
          Agent Graph
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${frozen ? "bg-dt-bg4 text-dt-text2" : "bg-dt-accent-dim text-dt-accent shadow-[0_0_8px_var(--accent-dim)]"}`}>
            {frozen ? "snapshot" : "real-time"}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleFitView}
            className="w-7 h-7 flex items-center justify-center rounded-dt-sm text-dt-text2 hover:text-dt-text0 hover:bg-dt-bg3 cursor-pointer border-none bg-transparent transition-all duration-150"
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
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          onNodeClick={handleNodeClick}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Graph toolbar (bottom-left) */}
        <div
          className="absolute bottom-12 left-3 flex flex-col gap-1 z-[5]"
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
              className="w-7 h-7 flex items-center justify-center bg-dt-bg3/80 backdrop-blur-[8px] border border-dt-border rounded-dt-sm text-dt-text2 hover:text-dt-text0 hover:bg-dt-bg4 cursor-pointer text-md transition-all duration-150 shadow-dt-sm"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Legend (top, full-width scrollable strip -- derived from actual DAG nodes) */}
        <div className={LEGEND_CONTAINER_CLASS}>
          {legendEntries.map(([name, color]) => (
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
          className="absolute bottom-0 left-0 right-0 h-9 flex items-center gap-4 px-4 bg-dt-bg1/90 backdrop-blur-[8px] border-t border-dt-border/50 font-mono text-sm text-dt-text2 z-[5]"
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

export function AgentFlowDAG({ dag, selectedAgent, onSelectAgent, frozen, onViewInLog, activeTurnAgentIds }: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner
        dag={dag}
        selectedAgent={selectedAgent}
        onSelectAgent={onSelectAgent}
        frozen={frozen}
        onViewInLog={onViewInLog}
        activeTurnAgentIds={activeTurnAgentIds}
      />
    </ReactFlowProvider>
  );
}
