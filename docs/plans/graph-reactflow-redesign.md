# Agent Graph — interactive react-flow redesign (engineer brief)

**Goal:** Turn the static Agent Graph into a KeyLines/ReGraph-style **interactive network**: small compact nodes by default, click to expand more data, and full canvas manipulation (pan / zoom / drag nodes / minimap). You own `dashboard/src/**` only.

## Why
Current `AgentGraph` renders large fixed cards in a scroll container — no pan/zoom/drag, nodes too big. The user wants the KeyLines/ReGraph feel.

## Use `@xyflow/react` (react-flow v12)
- `pnpm -C dashboard add @xyflow/react` (latest v12). Import its CSS once: `import "@xyflow/react/dist/style.css";` (in `AgentGraph.tsx`).
- It provides pan (drag background), zoom (wheel + on-screen buttons), node dragging, `<MiniMap>`, `<Controls>`, `<Background>`, `fitView`.

## Tasks (TDD where logic is pure; mock react-flow for component tests)

### 1. Pure transform — `dashboard/src/lib/agentFlowElements.ts`
`toFlowElements(dag: AgentDAG, positions: Map<string,{x,y}>, runningAgentIds: Set<string>, selectedId: string|null)` → `{ nodes: FlowNode[], edges: FlowEdge[] }`:
- One react-flow node per `dag.node`: `{ id, type: "agent", position: positions.get(id) ?? {x:0,y:0}, data: { node, running: runningAgentIds.has(id), selected: id===selectedId }, selected: id===selectedId }`.
- One edge per `dag.edge`: `{ id: `${source}->${target}`, source, target, type: "default" }`.
- Pure + deterministic. **Unit test** (`agentFlowElements.test.ts`): node/edge counts, running flag, selected flag, position fallback.
- Reuse `forceGraphLayout` (existing) for initial positions: `forceGraphLayout(dag, {nodeW, nodeH, pad})` → map id→{cx,cy} → {x: cx, y: cy}.

### 2. Custom node — `dashboard/src/components/graph/AgentFlowNode.tsx`
A react-flow custom node (`memo`, `NodeProps`). Reuse the existing 2-mode logic from `AgentGraphNode.tsx` (`nodeMode(running)` → running/finished; accent-spin / green-check; status badge). Two states:
- **COMPACT (default, NOT selected):** small (~`w-44`/176px max, single emphasis line). Show: status icon (small) + agent name (`displayName`) + a status dot/badge. One micro-metric line optional (`↓in ↑out`). `dt-*` tokens, `rounded-dt-lg`, border in status color, `shadow-dt-sm`. Compact = much smaller than today's card.
- **EXPANDED (selected):** the fuller card — status icon chip + name + model + status badge + description (truncated, title attr) + metrics row (`ArrowDownToLine` in, `ArrowUpFromLine` out, `Wrench` tools). Essentially today's `AgentGraphNode` content. `shadow-dt-glow` when running.
- Hidden connection handles: `<Handle type="target" position={Position.Top} isConnectable={false} className="!opacity-0" />` + matching source handle, so edges anchor but no manual edge editing.
- Keep `data-testid="agent-graph-node-${id}"`, `data-mode`, `data-running` for tests/parity.
- a11y: `aria-label` describing agent + mode.

### 3. Rewrite `dashboard/src/components/graph/AgentGraph.tsx`
- Props UNCHANGED: `{ dag, runningAgentIds, selectedAgentId, onSelectAgent }`.
- Build initial elements via `toFlowElements` + `forceGraphLayout`. Use `useNodesState`/`useEdgesState` so user **drags persist** during the session.
- Re-seed nodes when the **structure** (node-id set) changes (new agents appear) — but DON'T clobber user-dragged positions of existing nodes (merge: keep existing node positions, add new ones at layout position). Update each node's `data` (running/selected) on every render without resetting positions.
- Render:
  ```tsx
  <ReactFlow nodes={nodes} edges={edges} nodeTypes={{ agent: AgentFlowNode }}
    onNodesChange={onNodesChange} onNodeClick={(_,n)=>onSelectAgent(n.id)}
    fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.1} maxZoom={2}
    proOptions={{ hideAttribution: true }} nodesConnectable={false} >
    <Background gap={20} className="!bg-dt-bg1" />
    <Controls showInteractive={false} />
    <MiniMap pannable zoomable nodeColor={...status colors...} />
  </ReactFlow>
  ```
- Container: `data-testid="agent-graph"`, full height/width, `bg-dt-bg1`.
- Empty state (`dag.nodes.length===0`): `data-testid="agent-graph-empty"` "No agents in this turn"... use "No agents in this session".
- Edges must be visible (default react-flow edge stroke; bump via `style={{ stroke: "var(--t3)", strokeWidth: 1.5 }}` or a CSS rule). They render at full opacity (no GSAP stranding — drop GSAP from this component).
- Theme: style `.react-flow__controls`, `.react-flow__minimap` minimally with dt tokens if easy; otherwise default is acceptable. Respect light/dark (Background uses dt-bg1).
- Remove the old GSAP/SVG-edge/force-position-rendering code (forceGraphLayout stays as a lib for initial positions).

### 4. Tests
- `agentFlowElements.test.ts` — pure transform (counts, flags, positions).
- `AgentGraph.test.tsx` — **mock `@xyflow/react`** (it needs ResizeObserver/DOM): e.g. `vi.mock("@xyflow/react", () => ({ ReactFlow: ({children}) => <div data-testid="rf">{children}</div>, Background:()=>null, Controls:()=>null, MiniMap:()=>null, Handle:()=>null, Position:{Top:"top",Bottom:"bottom"}, useNodesState:(i)=>[i,vi.fn(),vi.fn()], useEdgesState:(i)=>[i,vi.fn(),vi.fn()] }))`. Assert: renders, empty-state when no nodes, derives correct node/edge counts (via toFlowElements), onNodeClick wiring (can test via the pure fn). Keep/adapt the existing AgentGraph.test assertions (node testids, empty state, onSelect).
- `AgentFlowNode.test.tsx` — render compact (not selected) → small + name + mode; render selected → expanded shows model/description/metrics; running → spin + glow; click → onSelect (if the node calls it) — note react-flow handles click at the flow level, so onSelectAgent is wired in AgentGraph via onNodeClick; the node itself may not need onClick. Test data-mode/data-running + content.
- Update `GraphPage.test.tsx` mock of `@xyflow/react` similarly if it renders AgentGraph (it does). Reuse the same mock.

## Gate (before returning)
`cd dashboard && npx tsc --noEmit` (0) + `pnpm -C dashboard test` (green) + `pnpm -C dashboard build` (clean) + `pnpm -C dashboard lint:styles` (no NEW violations vs HEAD). Report files+lines, the new dep version, and any react-flow caveats.

## Constraints
dt-* tokens, named exports, lucide icons, no `any`. Keep `AgentDetailPanel` (right rail log) untouched — clicking a node still selects it and the panel shows its log (GraphPage already wires `onSelectAgent` → selectedAgentId → AgentDetailPanel). Do NOT touch server/.
