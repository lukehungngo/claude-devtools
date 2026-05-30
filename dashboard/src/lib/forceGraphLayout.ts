import type { AgentDAG } from "./types";

export interface ForceLayoutNode {
  id: string;
  /** Center x in the final pixel space. */
  cx: number;
  /** Center y in the final pixel space. */
  cy: number;
}

export interface ForceLayout {
  nodes: ForceLayoutNode[];
  edges: { source: string; target: string }[];
  /** Canvas size needed to contain every node card + padding. */
  width: number;
  height: number;
}

export interface ForceOptions {
  /** Node card width (used to keep connected cards from overlapping). */
  nodeW: number;
  /** Node card height. */
  nodeH: number;
  /** Padding around the graph. */
  pad: number;
  /** Simulation iterations (more = more settled). */
  iterations?: number;
}

/**
 * Deterministic force-directed (Fruchterman–Reingold) layout. Produces an
 * organic CONNECTED graph — nodes repel each other, edges pull connected nodes
 * together — rather than a rigid hierarchy tree. Deterministic (seeded on a
 * circle by index, fixed iteration count, no randomness) so positions are
 * stable across re-renders for the same structure.
 *
 * Returns node CENTERS plus the canvas size; consumers convert a center to a
 * card top-left via (cx - nodeW/2, cy - nodeH/2) and draw center-to-center edges.
 */
export function forceGraphLayout(dag: AgentDAG, opts: ForceOptions): ForceLayout {
  const { nodeW, nodeH, pad } = opts;
  const iterations = opts.iterations ?? 320;
  const ids = dag.nodes.map((n) => n.id);
  const N = ids.length;
  const edges = dag.edges.map((e) => ({ source: e.source, target: e.target }));

  if (N === 0) {
    return { nodes: [], edges, width: nodeW + pad * 2, height: nodeH + pad * 2 };
  }
  if (N === 1) {
    return {
      nodes: [{ id: ids[0], cx: pad + nodeW / 2, cy: pad + nodeH / 2 }],
      edges,
      width: nodeW + pad * 2,
      height: nodeH + pad * 2,
    };
  }

  // Ideal edge length — comfortably larger than a card so connected cards
  // settle apart instead of overlapping.
  const k = Math.max(nodeW, nodeH) * 1.5;
  const idx = new Map(ids.map((id, i) => [id, i]));

  // Deterministic seed: evenly spaced on a circle.
  const R = (k * N) / (2 * Math.PI);
  const pos = ids.map((_, i) => {
    const a = (2 * Math.PI * i) / N;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R };
  });

  const adj = edges
    .map((e) => [idx.get(e.source), idx.get(e.target)] as [number | undefined, number | undefined])
    .filter((p): p is [number, number] => p[0] !== undefined && p[1] !== undefined && p[0] !== p[1]);

  const MIN = 0.01;
  let temp = k * 2;
  const cool = temp / (iterations + 1);

  for (let it = 0; it < iterations; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));

    // Repulsion between every pair (FR repulsive force k^2 / d).
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy);
        if (dist < MIN) {
          // Deterministic nudge for coincident points.
          dx = ((i % 2) === 0 ? 1 : -1) * (1 + i);
          dy = ((j % 2) === 0 ? 1 : -1) * (1 + j);
          dist = Math.hypot(dx, dy);
        }
        const f = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        disp[i].x += ux * f;
        disp[i].y += uy * f;
        disp[j].x -= ux * f;
        disp[j].y -= uy * f;
      }
    }

    // Attraction along edges (FR attractive force d^2 / k).
    for (const [a, b] of adj) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      let dist = Math.hypot(dx, dy);
      if (dist < MIN) dist = MIN;
      const f = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      disp[a].x -= ux * f;
      disp[a].y -= uy * f;
      disp[b].x += ux * f;
      disp[b].y += uy * f;
    }

    // Apply displacement capped by temperature, plus a gentle centering pull.
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(disp[i].x, disp[i].y) || MIN;
      const cap = Math.min(d, temp);
      pos[i].x += (disp[i].x / d) * cap;
      pos[i].y += (disp[i].y / d) * cap;
      pos[i].x *= 0.99;
      pos[i].y *= 0.99;
    }
    temp = Math.max(temp - cool, k * 0.05);
  }

  // Normalize to pixel space so the top-left card fits within padding.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const offX = pad + nodeW / 2 - minX;
  const offY = pad + nodeH / 2 - minY;
  const nodes = ids.map((id, i) => ({ id, cx: pos[i].x + offX, cy: pos[i].y + offY }));
  const width = maxX - minX + nodeW + pad * 2;
  const height = maxY - minY + nodeH + pad * 2;
  return { nodes, edges, width, height };
}
