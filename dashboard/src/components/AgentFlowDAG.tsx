import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import type { AgentDAG, AgentNode as AgentNodeType } from "../lib/types";
import { AgentNodeCard } from "./AgentNodeCard";

const nodeTypes = { agentCard: AgentNodeCard };

const NODE_WIDTH = 240;
const NODE_HEIGHT = 140;

function getLayoutedElements(dag: AgentDAG) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

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
      data: { agent: n },
    };
  });

  const edges: Edge[] = dag.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    animated: dag.nodes.find((n) => n.id === e.target)?.status === "active",
    style: { stroke: "#4b5563" },
  }));

  return { nodes, edges };
}

interface Props {
  dag: AgentDAG;
  onSelectAgent?: (agentId: string) => void;
}

export function AgentFlowDAG({ dag, onSelectAgent }: Props) {
  const { nodes, edges } = useMemo(() => getLayoutedElements(dag), [dag]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectAgent?.(node.id)}
      >
        <Background
          color="#374151"
          gap={20}
          className="!bg-gray-50 dark:!bg-gray-950"
        />
        <Controls className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 [&>button]:!bg-white dark:[&>button]:!bg-gray-800 [&>button]:!border-gray-200 dark:[&>button]:!border-gray-700" />
      </ReactFlow>
    </div>
  );
}
