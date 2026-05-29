import { useMemo, useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import type { AgentDAG } from "../../lib/types";
import { agentGraphLayout } from "../../lib/agentGraphLayout";
import { AgentGraphNode } from "./AgentGraphNode";

export interface AgentGraphProps {
  dag: AgentDAG;
  runningAgentIds: Set<string>;
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

/** Layout-to-pixel scaling constants (column / row spacing + card size). */
const COL_GAP = 200;
const ROW_GAP = 130;
const PAD_X = 24;
const PAD_Y = 24;
const NODE_W = 176; // matches AgentGraphNode max-w-[11rem]
const NODE_H = 86; // approximate card height for edge anchoring

interface PositionedNode {
  id: string;
  left: number;
  top: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function AgentGraph({ dag, runningAgentIds, selectedAgentId, onSelectAgent }: AgentGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { layout, positions, nodeById } = useMemo(() => {
    const computed = agentGraphLayout(dag);
    const positionsMap = new Map<string, PositionedNode>(
      computed.nodes.map((n) => [
        n.id,
        { id: n.id, left: PAD_X + n.x * COL_GAP, top: PAD_Y + n.y * ROW_GAP },
      ]),
    );
    const byId = new Map(dag.nodes.map((n) => [n.id, n]));
    return { layout: computed, positions: positionsMap, nodeById: byId };
  }, [dag]);

  // Stable key of the node-id set — only re-run GSAP when structure changes
  // (Architecture Invariant #10: animate only on structural change).
  const nodeIdKey = useMemo(
    () => layout.nodes.map((n) => n.id).sort().join(","),
    [layout],
  );

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const root = containerRef.current;
    if (!root) return;
    const nodeEls = root.querySelectorAll<HTMLElement>("[data-graph-node]");
    const edgeEls = root.querySelectorAll<SVGElement>("[data-graph-edge]");
    if (nodeEls.length === 0) return;

    const tl = gsap.timeline();
    tl.from(nodeEls, { opacity: 0, scale: 0.85, duration: 0.3, stagger: 0.05, ease: "power2.out" });
    if (edgeEls.length > 0) {
      tl.from(edgeEls, { opacity: 0, duration: 0.25, stagger: 0.04 }, "<");
    }
    return () => {
      if (typeof tl?.kill === "function") tl.kill();
    };
  }, [nodeIdKey]);

  if (dag.nodes.length === 0) {
    return (
      <div
        data-testid="agent-graph-empty"
        className="flex items-center justify-center h-full text-dt-text2 text-md font-mono"
      >
        No agents in this turn
      </div>
    );
  }

  // Canvas dimensions from the furthest-positioned node.
  const maxLeft = Math.max(...Array.from(positions.values(), (p) => p.left), 0);
  const maxTop = Math.max(...Array.from(positions.values(), (p) => p.top), 0);
  const canvasW = maxLeft + NODE_W + PAD_X;
  const canvasH = maxTop + NODE_H + PAD_Y;

  return (
    <div
      ref={containerRef}
      data-testid="agent-graph"
      className="relative overflow-auto h-full w-full bg-dt-bg1"
    >
      {/* The SVG sits in normal flow and sizes the relative wrapper via its
          width/height attributes (not an inline style), so absolutely
          positioned nodes share the same scroll area. */}
      <div className="relative inline-block min-w-full min-h-full">
        <svg
          className="block pointer-events-none"
          width={canvasW}
          height={canvasH}
          aria-hidden="true"
        >
          {layout.edges.map((e) => {
            const from = positions.get(e.source);
            const to = positions.get(e.target);
            if (!from || !to) return null;
            const x1 = from.left + NODE_W / 2;
            const y1 = from.top + NODE_H;
            const x2 = to.left + NODE_W / 2;
            const y2 = to.top;
            return (
              <line
                key={`${e.source}->${e.target}`}
                data-testid={`agent-graph-edge-${e.source}-${e.target}`}
                data-graph-edge=""
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--bd-s)"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {layout.nodes.map((ln) => {
          const node = nodeById.get(ln.id);
          const pos = positions.get(ln.id);
          if (!node || !pos) return null;
          return (
            <span key={ln.id} data-graph-node="">
              <AgentGraphNode
                node={node}
                x={pos.left}
                y={pos.top}
                selected={selectedAgentId === node.id}
                running={runningAgentIds.has(node.id)}
                onSelect={onSelectAgent}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
