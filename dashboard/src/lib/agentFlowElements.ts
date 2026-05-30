import type { Edge, Node } from "@xyflow/react";
import type { AgentDAG, AgentNode } from "./types";

/**
 * Data carried by every react-flow agent node. Kept minimal: the full AgentNode
 * plus the two render-affecting flags the custom node needs (running / selected).
 * `Record<string, unknown>` index is required by react-flow's Node generic.
 */
export interface AgentFlowNodeData extends Record<string, unknown> {
  node: AgentNode;
  running: boolean;
  selected: boolean;
}

/** A react-flow node specialised to our `agent` node type. */
export type AgentFlowNode = Node<AgentFlowNodeData, "agent">;

/** A react-flow edge for the agent graph (default bezier rendering). */
export type AgentFlowEdge = Edge;

export interface FlowElements {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
}

/**
 * Pure, deterministic transform from the domain DAG to react-flow elements.
 *
 * One node per `dag.node` (type "agent") positioned from `positions` (falling
 * back to the origin), and one edge per `dag.edge`. The `running`/`selected`
 * flags are mirrored onto `data` (consumed by the custom node) and `selected`
 * (consumed by react-flow for native selection styling).
 */
export function toFlowElements(
  dag: AgentDAG,
  positions: Map<string, { x: number; y: number }>,
  runningAgentIds: Set<string>,
  selectedId: string | null,
): FlowElements {
  const nodes: AgentFlowNode[] = dag.nodes.map((node) => {
    const isSelected = node.id === selectedId;
    return {
      id: node.id,
      type: "agent",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      selected: isSelected,
      data: {
        node,
        running: runningAgentIds.has(node.id),
        selected: isSelected,
      },
    };
  });

  const edges: AgentFlowEdge[] = dag.edges.map((edge) => ({
    id: `${edge.source}->${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: "default",
  }));

  return { nodes, edges };
}
