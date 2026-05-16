import { useMemo } from "react";
import type { SessionEvent, AssistantEvent, SystemEvent } from "../../lib/types";
import { mainEventsOnly } from "../../lib/turnEventFilters";

interface ContextPressureChartProps {
  events: SessionEvent[];
  contextWindowSize: number;
  width?: number;
  height?: number;
  /** Suppress the chart entirely below this peak %. Default 30%. */
  showAtLeastPercent?: number;
}

interface TurnPoint {
  index: number;
  percent: number;
  tokens: number;
  timestamp: string;
}

interface CompactMark {
  turnIndex: number;
  preTokens: number;
  postTokens?: number;
  trigger: string;
}

/**
 * Per-turn context-usage timeline. Replaces the 3-second compact toast with a
 * permanent surface so users can see autocompact thresholds + compaction
 * effectiveness over the session.
 *
 * X-axis: assistant turn index (main thread only).
 * Y-axis: input_tokens + cache (effective context) / contextWindowSize.
 * Vertical markers: compact_boundary events with trigger label.
 *
 * Suppressed when peak context < showAtLeastPercent (default 30%) — short
 * sessions don't need the chart.
 */
export function ContextPressureChart({
  events,
  contextWindowSize,
  width = 800,
  height = 96,
  showAtLeastPercent = 30,
}: ContextPressureChartProps): JSX.Element | null {
  const { points, compacts, peakPct } = useMemo(() => {
    const mainEvents = mainEventsOnly(events);
    const pts: TurnPoint[] = [];
    const marks: CompactMark[] = [];
    let turnIdx = 0;

    for (const e of mainEvents) {
      if (e.type === "assistant") {
        const asst = e as AssistantEvent;
        const usage = asst.message?.usage;
        if (!usage) continue;
        const input = usage.input_tokens || 0;
        const cacheW = usage.cache_creation_input_tokens || 0;
        const cacheR = usage.cache_read_input_tokens || 0;
        const tokens = input + cacheW + cacheR;
        const pct = contextWindowSize > 0
          ? Math.min(100, (tokens / contextWindowSize) * 100)
          : 0;
        pts.push({ index: turnIdx, percent: pct, tokens, timestamp: e.timestamp });
        turnIdx += 1;
      } else if (e.type === "system" && (e as SystemEvent).subtype === "compact_boundary") {
        const sys = e as SystemEvent & {
          compactMetadata?: {
            trigger?: string;
            preTokens?: number;
            postTokens?: number;
          };
        };
        const meta = sys.compactMetadata;
        marks.push({
          turnIndex: turnIdx,
          preTokens: meta?.preTokens ?? 0,
          postTokens: meta?.postTokens,
          trigger: meta?.trigger ?? "auto",
        });
      }
    }

    const peak = pts.length > 0 ? Math.max(...pts.map((p) => p.percent)) : 0;
    return { points: pts, compacts: marks, peakPct: peak };
  }, [events, contextWindowSize]);

  if (points.length < 2 || peakPct < showAtLeastPercent) return null;

  const PAD_L = 32;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 18;
  const chartW = width - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;
  const maxIdx = Math.max(1, points[points.length - 1].index);

  const xForIdx = (i: number) => PAD_L + (i / maxIdx) * chartW;
  const yForPct = (p: number) => PAD_T + chartH - (p / 100) * chartH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xForIdx(p.index).toFixed(1)} ${yForPct(p.percent).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${xForIdx(points[points.length - 1].index).toFixed(1)} ${PAD_T + chartH} L ${PAD_L} ${PAD_T + chartH} Z`;

  const lineColor = peakPct >= 85 ? "var(--err)" : peakPct >= 60 ? "var(--amb)" : "var(--cyan)";
  const fillColor = peakPct >= 85 ? "var(--err-dim)" : peakPct >= 60 ? "var(--amb-bg)" : "var(--cyan-dim)";

  return (
    <div
      data-testid="context-pressure-chart"
      className="t-mono-sm"
      role="img"
      aria-label={`Context pressure: peak ${Math.round(peakPct)}% over ${points.length} turns, ${compacts.length} compaction${compacts.length === 1 ? "" : "s"}`}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Y-axis gridlines */}
        {[0, 50, 100].map((p) => (
          <g key={p}>
            <line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={yForPct(p)}
              y2={yForPct(p)}
              stroke="var(--bd)"
              strokeWidth={1}
              strokeDasharray={p === 0 ? "" : "2 3"}
            />
            <text
              x={PAD_L - 4}
              y={yForPct(p) + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--t3)"
            >
              {p}%
            </text>
          </g>
        ))}
        {/* Autocompact threshold line at 80% */}
        <line
          x1={PAD_L}
          x2={width - PAD_R}
          y1={yForPct(80)}
          y2={yForPct(80)}
          stroke="var(--amb)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.5}
        />
        {/* Compact markers (rendered behind the line) */}
        {compacts.map((c, i) => (
          <g key={`compact-${i}`}>
            <line
              data-testid={`compact-marker-${i}`}
              x1={xForIdx(c.turnIndex)}
              x2={xForIdx(c.turnIndex)}
              y1={PAD_T}
              y2={PAD_T + chartH}
              stroke="var(--purple)"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
            <title>{`Compaction (${c.trigger}): ${c.preTokens.toLocaleString()}${c.postTokens ? ` → ${c.postTokens.toLocaleString()}` : ""} tokens`}</title>
          </g>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill={fillColor} />
        {/* Line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} />
        {/* Last-point dot */}
        {points.length > 0 && (
          <circle
            cx={xForIdx(points[points.length - 1].index)}
            cy={yForPct(points[points.length - 1].percent)}
            r={2.5}
            fill={lineColor}
          />
        )}
        {/* X-axis labels */}
        <text x={PAD_L} y={height - 4} fontSize={9} fill="var(--t3)">
          turn 1
        </text>
        <text x={width - PAD_R} y={height - 4} textAnchor="end" fontSize={9} fill="var(--t3)">
          turn {points.length}
        </text>
      </svg>
    </div>
  );
}
