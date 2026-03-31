import { memo, useMemo, useRef, useState, useCallback } from "react";
import type { AgentDAG, AgentNode } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { filterDagForTurn } from "../../lib/filterDagForTurn";
import { formatCost, formatDuration } from "../../lib/cost";

/** Height of the tab bar in pixels */
const TAB_BAR_HEIGHT = 37;
const DEFAULT_LABEL_WIDTH = 140;
const MIN_LABEL_WIDTH = 80;
const MAX_LABEL_WIDTH = 400;
const DURATION_COL_WIDTH = 72;
const COST_COL_WIDTH = 64;
const DATA_COLS_WIDTH = DURATION_COL_WIDTH + COST_COL_WIDTH;

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

const SPAN_COLORS: Record<string, { bg: string; text: string }> = {
  orchestrator: { bg: "var(--span-pm)", text: "var(--span-pm-t)" },
  main:         { bg: "var(--span-pm)", text: "var(--span-pm-t)" },
  engineer:     { bg: "var(--span-swe)", text: "var(--span-swe-t)" },
  reviewer:     { bg: "var(--span-rev)", text: "var(--span-rev-t)" },
  "bug-fixer":  { bg: "var(--span-bug)", text: "var(--span-bug-t)" },
  researcher:   { bg: "var(--span-doc)", text: "var(--span-doc-t)" },
  tester:       { bg: "var(--span-qa)", text: "var(--span-qa-t)" },
  qa:           { bg: "var(--span-qa)", text: "var(--span-qa-t)" },
};

const FALLBACK_COLOR = { bg: "var(--span-swe2)", text: "var(--span-swe2-t)" };

export function getSpanColor(type: string): { bg: string; text: string } {
  return SPAN_COLORS[type] ?? FALLBACK_COLOR;
}

// ── Icon mapping ──

const SPAN_ICONS: Record<string, string> = {
  orchestrator: "PM",
  main: "PM",
  reviewer: "CR",
  "bug-fixer": "BF",
  researcher: "RS",
  tester: "QA",
  qa: "QA",
};

export function getSpanIcon(type: string, engineerIndex: number): string {
  if (type === "engineer") return `S${engineerIndex + 1}`;
  if (SPAN_ICONS[type]) return SPAN_ICONS[type];
  // Fallback: first 2 chars uppercased
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
  const leftPct = ((nodeStartMs - sessionStartMs) / totalMs) * 100;

  if (node.status === "active" || !node.endTime) {
    return { leftPct, widthPct: Math.max(1, 100 - leftPct) };
  }

  const nodeEndMs = new Date(node.endTime).getTime();
  const widthPct = Math.max(1, ((nodeEndMs - nodeStartMs) / totalMs) * 100);

  return { leftPct, widthPct };
}

// ── Tree building ──

interface TraceRow {
  node: AgentNode;
  depth: number;
  icon: string;
  color: { bg: string; text: string };
  bar: BarPosition;
  durationMs: number;
}

interface TraceGroup {
  rows: TraceRow[];
  isParallel: boolean;
}

function buildTraceGroups(
  dag: AgentDAG,
  timeline: Timeline,
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

  // Track engineer index for numbering
  let engineerIdx = 0;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  function buildRow(node: AgentNode, depth: number): TraceRow {
    const icon = getSpanIcon(node.type, node.type === "engineer" ? engineerIdx++ : 0);
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

    return { node, depth, icon, color, bar, durationMs };
  }

  function collectChildren(parentId: string, depth: number): TraceGroup[] {
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
      rows.push(buildRow(child, depth));
      nestedGroups.push(...collectChildren(child.id, depth + 1));
    }

    return [{ rows, isParallel }, ...nestedGroups];
  }

  const groups: TraceGroup[] = [];

  for (const root of rootNodes) {
    groups.push({ rows: [buildRow(root, 0)], isParallel: false });
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
}

const TraceRowComponent = memo(function TraceRowComponent({
  row,
  selected,
  onSelect,
  labelWidth,
}: TraceRowComponentProps) {
  const { node, depth, icon, color, bar, durationMs } = row;

  const handleClick = useCallback(() => {
    onSelect?.(node.id);
  }, [onSelect, node.id]);

  const isActive = node.status === "active";
  const label = node.description || node.type;
  const durationStr = durationMs > 0 ? formatDuration(durationMs) : "";
  const costStr = formatCost(node.tokenUsage.totalCost);

  return (
    <div
      className={`trace-row${selected ? " trace-row-selected" : ""}`}
      onClick={handleClick}
    >
      <div className="trace-label" style={{ width: labelWidth }}>
        {depth > 0 && (
          <div className="trace-indent" style={{ width: depth * 12 }} />
        )}
        <div
          className="trace-icon"
          style={{ background: color.bg, color: color.text }}
        >
          {icon}
        </div>
        <div className="trace-name">{label}</div>
      </div>
      <div className="trace-col-duration">{isActive ? "running" : durationStr}</div>
      <div className="trace-col-cost">{costStr}</div>
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
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

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

  const { timeline, groups } = useMemo(() => {
    if (!filteredDag || filteredDag.nodes.length === 0) {
      return { timeline: null, groups: [] };
    }
    const tl = computeTimeline(filteredDag.nodes);
    const gr = buildTraceGroups(filteredDag, tl);
    return { timeline: tl, groups: gr };
  }, [filteredDag]);

  // Drag-to-resize label column
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: labelWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const newWidth = Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, dragRef.current.startWidth + delta));
      setLabelWidth(newWidth);
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
  }, [labelWidth]);

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
        </div>
        <div className="trace-col-duration trace-col-header">Duration</div>
        <div className="trace-col-cost trace-col-header">Cost</div>
        <div className="trace-ticks">
          {timeline.ticks.map((tick, i) => (
            <span key={i}>{tick}</span>
          ))}
        </div>
      </div>
      <div className="trace-body">
        {/* Vertical grid lines */}
        <div className="trace-grid" style={{ left: labelWidth + DATA_COLS_WIDTH }}>
          {timeline.ticks.map((_, i) => (
            <div key={i} />
          ))}
        </div>
        {/* Resize handle */}
        <div
          className="trace-resize-handle"
          style={{ left: labelWidth + DATA_COLS_WIDTH - 2 }}
          onMouseDown={handleResizeStart}
        />
        {/* Agent rows */}
        {groups.map((group, gi) => {
          if (group.isParallel && group.rows.length > 1) {
            const bracketHeight = group.rows.length * 42 - 10;
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
            />
          ));
        })}
      </div>
    </div>
  );
}

export const TraceTab = memo(TraceTabInner);
