import { useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentDAG } from "../../lib/types";
import { forceGraphLayout } from "../../lib/forceGraphLayout";
import { toFlowElements, type AgentFlowNode as FlowNode } from "../../lib/agentFlowElements";
import { AgentFlowNode } from "./AgentFlowNode";

export interface AgentGraphProps {
  dag: AgentDAG;
  runningAgentIds: Set<string>;
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

const PAD = 40;
// Compact-node footprint drives the initial force layout spacing. Nodes expand
// on selection but the layout stays seeded for the compact (default) size.
const NODE_W = 176; // w-44
const NODE_H = 64;

const nodeTypes = { agent: AgentFlowNode };

// Default edge styling — must clear the 3:1 graphical-contrast minimum on both
// themes. --t3 @1.5px measured ~2.1-2.4:1 (too faint); --t2 @2px clears it.
const EDGE_STYLE = { stroke: "var(--t2)", strokeWidth: 2 } as const;
const RUNNING_COLOR = "var(--acc)";
const FINISHED_COLOR = "var(--grn)";

/** Initial positions from the deterministic force layout (id → {x,y} top-left). */
function layoutPositions(dag: AgentDAG): Map<string, { x: number; y: number }> {
  const layout = forceGraphLayout(dag, { nodeW: NODE_W, nodeH: NODE_H, pad: PAD });
  const map = new Map<string, { x: number; y: number }>();
  for (const n of layout.nodes) {
    map.set(n.id, { x: n.cx - NODE_W / 2, y: n.cy - NODE_H / 2 });
  }
  return map;
}

export function AgentGraph({ dag, runningAgentIds, selectedAgentId, onSelectAgent }: AgentGraphProps) {
  // Structural signature — only the node/edge SET (not data like token counts).
  // Positions are re-seeded only when this changes.
  const structureKey = useMemo(() => {
    const ns = dag.nodes.map((n) => n.id).sort().join(",");
    const es = dag.edges.map((e) => `${e.source}>${e.target}`).sort().join(",");
    return `${ns}|${es}`;
  }, [dag]);

  const initial = useMemo(
    () => toFlowElements(dag, layoutPositions(dag), runningAgentIds, selectedAgentId),
    // Seed positions once per structure; data is patched separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);

  // Re-seed on STRUCTURE change only: keep existing (possibly user-dragged)
  // positions, add newcomers at their layout position, drop removed nodes.
  const prevStructureRef = useRef(structureKey);
  useEffect(() => {
    if (prevStructureRef.current === structureKey) return;
    prevStructureRef.current = structureKey;
    const fresh = toFlowElements(dag, layoutPositions(dag), runningAgentIds, selectedAgentId);
    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return fresh.nodes.map((n) => {
        const existing = byId.get(n.id);
        // Preserve a dragged position; only adopt layout position for newcomers.
        return existing ? { ...n, position: existing.position } : n;
      });
    });
    setEdges(fresh.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  // Patch render-affecting data (the node's live metrics + running / selected)
  // WITHOUT touching positions — keeps the graph live without re-layout. Must
  // refresh `data.node` from the latest dag too: token/tool counts accrue on a
  // stable structure (e.g. the always-present `main` node), and freezing
  // `data.node` at seed left the expanded card showing stale numbers.
  useEffect(() => {
    const byId = new Map(dag.nodes.map((n) => [n.id, n]));
    setNodes((current) =>
      current.map((n) => {
        const running = runningAgentIds.has(n.id);
        const selected = n.id === selectedAgentId;
        const node = byId.get(n.id) ?? n.data.node;
        if (
          n.data.node === node &&
          n.data.running === running &&
          n.data.selected === selected &&
          n.selected === selected
        ) {
          return n;
        }
        return { ...n, selected, data: { ...n.data, node, running, selected } };
      }),
    );
  }, [dag, runningAgentIds, selectedAgentId, setNodes]);

  if (dag.nodes.length === 0) {
    return (
      <div
        data-testid="agent-graph-empty"
        className="flex items-center justify-center h-full text-dt-text2 text-md font-mono"
      >
        No agents in this session
      </div>
    );
  }

  return (
    <div data-testid="agent-graph" className="relative h-full w-full bg-dt-bg1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, n) => onSelectAgent(n.id)}
        defaultEdgeOptions={{ type: "default", style: EDGE_STYLE }}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable
      >
        <Background gap={20} variant={BackgroundVariant.Dots} className="!bg-dt-bg1" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (runningAgentIds.has(n.id) ? RUNNING_COLOR : FINISHED_COLOR)}
          className="!bg-dt-bg2"
        />
      </ReactFlow>
    </div>
  );
}
