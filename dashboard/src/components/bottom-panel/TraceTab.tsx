import { memo, useMemo, useRef, useState, useCallback } from "react";
import type { AgentDAG, AgentNode } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { filterDagForTurn } from "../../lib/filterDagForTurn";
import { formatCost, formatDuration } from "../../lib/cost";
import { formatModelName } from "../../lib/formatModelName";

/** Height of the tab bar in pixels */
const TAB_BAR_HEIGHT = 37;
const AGENT_ROW_HEIGHT = 48;
const TOOL_ROW_HEIGHT = 26;
const ROW_MARGIN = 2;
const DEFAULT_LABEL_WIDTH = 140;
const MIN_LABEL_WIDTH = 60;
const MAX_LABEL_WIDTH = 400;
const NAME_COL_WIDTH = 60;
const MODEL_COL_WIDTH = 88;
const DURATION_COL_WIDTH = 72;
const COST_COL_WIDTH = 64;
const DATA_COLS_WIDTH = NAME_COL_WIDTH + MODEL_COL_WIDTH + DURATION_COL_WIDTH + COST_COL_WIDTH;

export interface TraceTabProps {
  dag: AgentDAG | null;
  turns: TurnSnapshot[];
  activeTurnIndex: number | null;
  selectedAgent: string | null;
  onSelectAgent?: (agentId: string) => void;
  isLive?: boolean;
  panelHeight: number;
}

// ── Color mapping ──

/** Known agent types get dedicated palette slots; everything else cycles through a palette. */
const KNOWN_COLORS: Record<string, { bg: string; text: string }> = {
  orchestrator: { bg: "var(--span-pm)", text: "var(--span-pm-t)" },
  main: { bg: "var(--span-pm)", text: "var(--span-pm-t)" },
  engineer: { bg: "var(--span-swe)", text: "var(--span-swe-t)" },
  reviewer: { bg: "var(--span-rev)", text: "var(--span-rev-t)" },
  "bug-fixer": { bg: "var(--span-bug)", text: "var(--span-bug-t)" },
  researcher: { bg: "var(--span-doc)", text: "var(--span-doc-t)" },
  tester: { bg: "var(--span-qa)", text: "var(--span-qa-t)" },
  qa: { bg: "var(--span-qa)", text: "var(--span-qa-t)" },
};

/** Palette for unknown agent types — cycles deterministically via string hash. */
const PALETTE: Array<{ bg: string; text: string }> = [
  { bg: "var(--span-swe)", text: "var(--span-swe-t)" },
  { bg: "var(--span-swe2)", text: "var(--span-swe2-t)" },
  { bg: "var(--span-rev)", text: "var(--span-rev-t)" },
  { bg: "var(--span-doc)", text: "var(--span-doc-t)" },
  { bg: "var(--span-qa)", text: "var(--span-qa-t)" },
  { bg: "var(--span-bug)", text: "var(--span-bug-t)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getSpanColor(type: string): { bg: string; text: string } {
  return KNOWN_COLORS[type] ?? PALETTE[hashString(type) % PALETTE.length];
}

// ── Icon / abbreviation ──

/**
 * Derive a 2-char abbreviation from any agent type string.
 * Handles hyphenated ("bug-fixer" → "BF"), camelCase ("codeFixer" → "CF"),
 * and single-word ("researcher" → "RE") types.
 */
export function getSpanIcon(type: string): string {
  // Split on hyphens, underscores, or camelCase boundaries
  const parts = type
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .split(/[-_]+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const clean = type.replace(/[^a-zA-Z]/g, "");
  return (clean.slice(0, 2) || "??").toUpperCase();
}

// ── Timeline computation ──

const DEFAULT_DURATION_MS = 60_000; // 1 min fallback
const TARGET_TICKS = 8;

export interface Timeline {
  sessionStartMs: number;
  sessionEndMs: number;
  totalMs: number;
  ticks: string[];
}

export function computeTimeline(nodes: AgentNode[]): Timeline {
  let minMs = Infinity;
  let maxMs = -Infinity;

  // If a "main" node exists, use its (turn-scoped) times as timeline bounds
  const mainNode = nodes.find((n) => n.id === "main");
  if (mainNode?.startTime) {
    minMs = new Date(mainNode.startTime).getTime();
    maxMs = mainNode.endTime
      ? new Date(mainNode.endTime).getTime()
      : Date.now();
  } else {
    // Fallback: scan all nodes (no main node or no times)
    for (const n of nodes) {
      if (n.startTime) {
        const t = new Date(n.startTime).getTime();
        if (t < minMs) minMs = t;
        if (t > maxMs) maxMs = t;
      }
      if (n.endTime) {
        const t = new Date(n.endTime).getTime();
        if (t > maxMs) maxMs = t;
      }
    }
  }

  // Handle no-time case
  const now = Date.now();
  if (minMs === Infinity) minMs = now - DEFAULT_DURATION_MS;
  if (maxMs === -Infinity || maxMs <= minMs) maxMs = minMs + DEFAULT_DURATION_MS;

  // Check for active nodes — extend to now if any are running
  for (const n of nodes) {
    if (n.status === "active" && now > maxMs) {
      maxMs = now;
      break;
    }
  }

  const totalMs = maxMs - minMs;
  const tickCount = Math.max(2, Math.min(TARGET_TICKS, Math.ceil(totalMs / 60_000) + 1));
  const intervalMs = totalMs / (tickCount - 1);

  const ticks: string[] = [];
  for (let i = 0; i < tickCount; i++) {
    const ms = i * intervalMs;
    const minutes = Math.round(ms / 60_000);
    ticks.push(`${minutes}m`);
  }

  return { sessionStartMs: minMs, sessionEndMs: maxMs, totalMs, ticks };
}

// ── Bar position ──

export interface BarPosition {
  leftPct: number;
  widthPct: number;
}

export function computeBarPosition(
  node: AgentNode,
  sessionStartMs: number,
  totalMs: number,
): BarPosition {
  if (!node.startTime) {
    return { leftPct: 0, widthPct: 100 };
  }

  const nodeStartMs = new Date(node.startTime).getTime();
  const rawLeft = ((nodeStartMs - sessionStartMs) / totalMs) * 100;

  if (node.status === "active" || !node.endTime) {
    const leftPct = Math.max(0, Math.min(100, rawLeft));
    return { leftPct, widthPct: Math.max(0.3, 100 - leftPct) };
  }

  const nodeEndMs = new Date(node.endTime).getTime();
  const leftPct = Math.max(0, Math.min(100, rawLeft));
  const rawWidth = Math.max(0.3, ((nodeEndMs - nodeStartMs) / totalMs) * 100);
  const widthPct = Math.max(0.3, Math.min(rawWidth, 100 - leftPct));

  return { leftPct, widthPct };
}

// ── Tree building ──

interface TraceRow {
  node: AgentNode;
  depth: number;
  isToolCall: boolean;
  icon: string;
  color: { bg: string; text: string };
  bar: BarPosition;
  durationMs: number;
  totalCost: number;
}

interface TraceGroup {
  rows: TraceRow[];
  isParallel: boolean;
}

function buildTraceGroups(
  dag: AgentDAG,
  timeline: Timeline,
  maxDepth?: number,
): TraceGroup[] {
  const { nodes, edges } = dag;
  const { sessionStartMs, totalMs } = timeline;

  // Build parent -> children map
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    const list = childrenOf.get(edge.source) ?? [];
    list.push(edge.target);
    childrenOf.set(edge.source, list);
  }

  // Find root nodes (no incoming edge)
  const hasParent = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !hasParent.has(n.id));

  // If no clear roots, treat all as roots
  const rootNodes = roots.length > 0 ? roots : nodes;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Compute aggregate cost for a node + all its descendants
  function aggregateCost(nodeId: string): number {
    const node = nodeMap.get(nodeId);
    if (!node) return 0;
    let cost = node.tokenUsage.totalCost;
    const children = childrenOf.get(nodeId) ?? [];
    for (const childId of children) {
      cost += aggregateCost(childId);
    }
    return cost;
  }

  function buildRow(node: AgentNode, depth: number, isRoot: boolean): TraceRow {
    const icon = getSpanIcon(node.type);
    const color = getSpanColor(node.type);
    const bar = computeBarPosition(node, sessionStartMs, totalMs);

    let durationMs = 0;
    if (node.startTime) {
      const start = new Date(node.startTime).getTime();
      const end = node.endTime
        ? new Date(node.endTime).getTime()
        : Date.now();
      durationMs = end - start;
    }

    // Root node: sum all descendants' cost; leaf: own cost
    const totalCost = isRoot ? aggregateCost(node.id) : node.tokenUsage.totalCost;

    const isToolCall = depth > 1;
    return { node, depth, isToolCall, icon, color, bar, durationMs, totalCost };
  }

  function collectChildren(parentId: string, depth: number): TraceGroup[] {
    if (maxDepth !== undefined && depth > maxDepth) return [];

    const childIds = childrenOf.get(parentId) ?? [];
    const children = childIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is AgentNode => n !== undefined);

    if (children.length === 0) return [];

    // Check if children overlap in time (parallel)
    const isParallel = children.length > 1 && hasTimeOverlap(children);

    const rows: TraceRow[] = [];
    const nestedGroups: TraceGroup[] = [];

    for (const child of children) {
      rows.push(buildRow(child, depth, false));
      nestedGroups.push(...collectChildren(child.id, depth + 1));
    }

    return [{ rows, isParallel }, ...nestedGroups];
  }

  const groups: TraceGroup[] = [];

  for (const root of rootNodes) {
    groups.push({ rows: [buildRow(root, 0, true)], isParallel: false });
    groups.push(...collectChildren(root.id, 1));
  }

  return groups;
}

function hasTimeOverlap(nodes: AgentNode[]): boolean {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a.startTime || !b.startTime) continue;
      const aStart = new Date(a.startTime).getTime();
      const aEnd = a.endTime ? new Date(a.endTime).getTime() : Date.now();
      const bStart = new Date(b.startTime).getTime();
      const bEnd = b.endTime ? new Date(b.endTime).getTime() : Date.now();
      if (aStart < bEnd && bStart < aEnd) return true;
    }
  }
  return false;
}

// ── Components ──

interface TraceRowComponentProps {
  row: TraceRow;
  selected: boolean;
  onSelect?: (id: string) => void;
  labelWidth: number;
  nameWidth: number;
  modelWidth: number;
  durationWidth: number;
  costWidth: number;
}

const TraceRowComponent = memo(function TraceRowComponent({
  row,
  selected,
  onSelect,
  labelWidth,
  nameWidth,
  modelWidth,
  durationWidth,
  costWidth,
}: TraceRowComponentProps) {
  const { node, depth, isToolCall, icon, color, bar, durationMs, totalCost } = row;

  const handleClick = useCallback(() => {
    onSelect?.(node.id);
  }, [onSelect, node.id]);

  const isActive = node.status === "active";
  const label = node.description || node.type;
  const durationStr = durationMs > 0 ? formatDuration(durationMs) : "";
  const costStr = formatCost(totalCost);

  const rowClass = `trace-row${isToolCall ? " trace-row-tool" : ""}${selected ? " trace-row-selected" : ""}`;

  return (
    <div
      className={rowClass}
      onClick={handleClick}
    >
      <div className="trace-label" style={{ width: labelWidth }}>
        {depth > 0 && (
          <div className="trace-indent" style={{ width: depth * 12 }} />
        )}
        <div
          className="trace-icon"
          style={{ background: color.bg, color: color.text }}
          title={node.type}
        >
          {icon}
        </div>
        <div className="trace-name">{label}</div>
      </div>
      <div className="trace-col-name" style={{ width: nameWidth }}>{node.type}</div>
      <div className="trace-col-model" style={{ width: modelWidth }} title={node.model}>
        {node.model ? formatModelName(node.model) : "—"}
      </div>
      <div className="trace-col-duration" style={{ width: durationWidth }}>{isActive ? "running" : durationStr}</div>
      <div className="trace-col-cost" style={{ width: costWidth }}>{costStr}</div>
      <div className="trace-track">
        <div
          className="trace-bar"
          style={{
            left: `${bar.leftPct}%`,
            width: `${bar.widthPct}%`,
            background: color.bg,
            color: color.text,
          }}
        >
          {isActive && (
            <span className="trace-bar-running">
              <span className="running-dot" />
              <span>running</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

function TraceTabInner({
  dag,
  turns,
  activeTurnIndex,
  selectedAgent,
  onSelectAgent,
  isLive: _isLive,
  panelHeight,
}: TraceTabProps) {
  const prevFilteredRef = useRef<AgentDAG | null>(null);
  const [labelWidth, setLabelWidth] = useState(DEFAULT_LABEL_WIDTH);
  const [nameWidth, setNameWidth] = useState(NAME_COL_WIDTH);
  const [modelWidth, setModelWidth] = useState(MODEL_COL_WIDTH);
  const [durationWidth, setDurationWidth] = useState(DURATION_COL_WIDTH);
  const [costWidth, setCostWidth] = useState(COST_COL_WIDTH);
  const [showAllDepths, setShowAllDepths] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number; setter: (w: number) => void } | null>(null);

  const activeTurn =
    activeTurnIndex !== null && activeTurnIndex >= 0 && activeTurnIndex < turns.length
      ? turns[activeTurnIndex]
      : undefined;

  const filteredDag = useMemo(() => {
    const result = filterDagForTurn(dag, activeTurn, prevFilteredRef.current);
    prevFilteredRef.current = result;
    return result;
  }, [dag, activeTurn]);

  const isEmpty = !filteredDag || filteredDag.nodes.length === 0;
  const contentHeight = panelHeight - TAB_BAR_HEIGHT;

  // Default depth limit: 2 (root=0, children=1, sub-agents=2). Toggle reveals all.
  const maxDepth = showAllDepths ? undefined : 2;

  const { timeline, groups, hasDeepNodes } = useMemo(() => {
    if (!filteredDag || filteredDag.nodes.length === 0) {
      return { timeline: null, groups: [], hasDeepNodes: false };
    }
    const tl = computeTimeline(filteredDag.nodes);
    const gr = buildTraceGroups(filteredDag, tl, maxDepth);
    // Check if there are deeper nodes that were hidden
    const allGr = maxDepth !== undefined ? buildTraceGroups(filteredDag, tl) : gr;
    const totalRows = allGr.reduce((sum, g) => sum + g.rows.length, 0);
    const visibleRows = gr.reduce((sum, g) => sum + g.rows.length, 0);
    return { timeline: tl, groups: gr, hasDeepNodes: totalRows > visibleRows };
  }, [filteredDag, maxDepth]);

  // Generic drag-to-resize for any column
  const makeResizeHandler = useCallback(
    (currentWidth: number, setter: (w: number) => void) =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        dragRef.current = { startX: e.clientX, startWidth: currentWidth, setter };

        const handleMouseMove = (ev: MouseEvent) => {
          if (!dragRef.current) return;
          const delta = ev.clientX - dragRef.current.startX;
          const newWidth = Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, dragRef.current.startWidth + delta));
          dragRef.current.setter(newWidth);
        };

        const handleMouseUp = () => {
          dragRef.current = null;
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      },
    [],
  );

  const handleLabelResize = useCallback(
    (e: React.MouseEvent) => makeResizeHandler(labelWidth, setLabelWidth)(e),
    [labelWidth, makeResizeHandler],
  );
  const handleNameResize = useCallback(
    (e: React.MouseEvent) => makeResizeHandler(nameWidth, setNameWidth)(e),
    [nameWidth, makeResizeHandler],
  );
  const handleModelResize = useCallback(
    (e: React.MouseEvent) => makeResizeHandler(modelWidth, setModelWidth)(e),
    [modelWidth, makeResizeHandler],
  );
  const handleDurationResize = useCallback(
    (e: React.MouseEvent) => makeResizeHandler(durationWidth, setDurationWidth)(e),
    [durationWidth, makeResizeHandler],
  );
  const handleCostResize = useCallback(
    (e: React.MouseEvent) => makeResizeHandler(costWidth, setCostWidth)(e),
    [costWidth, makeResizeHandler],
  );

  const dataCols = nameWidth + modelWidth + durationWidth + costWidth;

  if (isEmpty || !timeline) {
    return (
      <div
        style={{ height: contentHeight }}
        className="flex items-center justify-center"
      >
        <span style={{ color: "var(--t3)", fontSize: 13 }}>No agent data</span>
      </div>
    );
  }

  return (
    <div
      style={{ height: contentHeight }}
      className="trace-area dt-scrollbar"
    >
      {/* Column headers */}
      <div className="trace-header">
        <div className="trace-header-label" style={{ width: labelWidth }}>
          Agent
          {hasDeepNodes && (
            <button
              data-testid="trace-depth-toggle"
              onClick={() => setShowAllDepths((v) => !v)}
              className="ml-1.5 cursor-pointer bg-transparent border-none font-mono"
              style={{ fontSize: 9, color: "var(--t3)", padding: "0 3px" }}
              title={showAllDepths ? "Collapse tool calls" : "Show all tool calls"}
            >
              {showAllDepths ? "▾ less" : "▸ more"}
            </button>
          )}
        </div>
        <div className="trace-col-name trace-col-header" style={{ width: nameWidth }}>Name</div>
        <div className="trace-col-model trace-col-header" style={{ width: modelWidth }}>Model</div>
        <div className="trace-col-duration trace-col-header" style={{ width: durationWidth }}>Duration</div>
        <div className="trace-col-cost trace-col-header" style={{ width: costWidth }}>Cost</div>
        <div className="trace-ticks">
          {timeline.ticks.map((tick, i) => (
            <span key={i}>{tick}</span>
          ))}
        </div>
      </div>
      <div className="trace-body">
        {/* Vertical grid lines */}
        <div className="trace-grid" style={{ left: labelWidth + dataCols }}>
          {timeline.ticks.map((_, i) => (
            <div key={i} />
          ))}
        </div>
        {/* Resize handles between columns */}
        <div
          className="trace-resize-handle"
          style={{ left: labelWidth - 2 }}
          onMouseDown={handleLabelResize}
        />
        <div
          className="trace-resize-handle"
          style={{ left: labelWidth + nameWidth - 2 }}
          onMouseDown={handleNameResize}
        />
        <div
          className="trace-resize-handle"
          style={{ left: labelWidth + nameWidth + modelWidth - 2 }}
          onMouseDown={handleModelResize}
        />
        <div
          className="trace-resize-handle"
          style={{ left: labelWidth + nameWidth + modelWidth + durationWidth - 2 }}
          onMouseDown={handleDurationResize}
        />
        <div
          className="trace-resize-handle"
          style={{ left: labelWidth + dataCols - 2 }}
          onMouseDown={handleCostResize}
        />
        {/* Agent rows */}
        {groups.map((group, gi) => {
          if (group.isParallel && group.rows.length > 1) {
            let bracketHeight = -10; // subtract bracket padding
            for (const r of group.rows) {
              bracketHeight += (r.isToolCall ? TOOL_ROW_HEIGHT : AGENT_ROW_HEIGHT) + ROW_MARGIN;
            }
            return (
              <div key={gi} style={{ position: "relative" }}>
                <div
                  className="par-bracket"
                  style={{ top: 6, height: bracketHeight }}
                />
                {group.rows.map((row) => (
                  <TraceRowComponent
                    key={row.node.id}
                    row={row}
                    selected={selectedAgent === row.node.id}
                    onSelect={onSelectAgent}
                    labelWidth={labelWidth}
                    nameWidth={nameWidth}
                    modelWidth={modelWidth}
                    durationWidth={durationWidth}
                    costWidth={costWidth}
                  />
                ))}
              </div>
            );
          }
          return group.rows.map((row) => (
            <TraceRowComponent
              key={row.node.id}
              row={row}
              selected={selectedAgent === row.node.id}
              onSelect={onSelectAgent}
              labelWidth={labelWidth}
              nameWidth={nameWidth}
              modelWidth={modelWidth}
              durationWidth={durationWidth}
              costWidth={costWidth}
            />
          ));
        })}
      </div>
    </div>
  );
}

export const TraceTab = memo(TraceTabInner);
