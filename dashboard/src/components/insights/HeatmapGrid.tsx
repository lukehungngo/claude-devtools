import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { InsightsHeatmapCell } from "../../lib/types.js";
import { EChartsWrapper } from "./EChartsWrapper.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface HeatmapGridProps {
  heatmap: InsightsHeatmapCell[];
  className?: string;
}

function getCSSVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

export function buildHeatmapOption(
  heatmap: InsightsHeatmapCell[]
): EChartsOption {
  const teal = getCSSVar("--teal", "#4B8A8A");
  const bg2 = getCSSVar("--bg-2", "#FFFFFF");
  const text2 = getCSSVar("--text-2", "#8B8780");

  const data: Array<[number, number, number]> = heatmap.map((cell) => [
    cell.hour,
    cell.day,
    cell.intensity,
  ]);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      // justification: ECharts CallbackDataParams is a large union; cast to access heatmap data tuple
      formatter: (params: unknown) => {
        const p = params as { data: [number, number, number] };
        const [hour, day, intensity] = p.data;
        const dayLabel = DAY_LABELS[day] ?? "?";
        return `${dayLabel} ${hour}:00 — intensity ${intensity}`;
      },
    },
    grid: { left: 28, right: 4, top: 16, bottom: 0 },
    xAxis: {
      type: "category",
      data: Array.from({ length: 24 }, (_, i) => i),
      axisLabel: {
        color: text2,
        fontSize: 8,
        formatter: (v: string) => (Number(v) % 6 === 0 ? String(v) : ""),
        interval: 0,
      },
      axisTick: { show: false },
      axisLine: { show: false },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: DAY_LABELS,
      axisLabel: { color: text2, fontSize: 8 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
    },
    visualMap: {
      min: 0,
      max: 4,
      calculable: false,
      show: false,
      inRange: { color: [bg2, teal] },
    },
    series: [
      {
        type: "heatmap",
        data,
        itemStyle: { borderRadius: 2 },
        emphasis: { itemStyle: { shadowBlur: 4 } },
      },
    ],
  };
}

export function HeatmapGrid({
  heatmap,
  className,
}: HeatmapGridProps): JSX.Element {
  const option = useMemo(() => buildHeatmapOption(heatmap), [heatmap]);

  return (
    <div className={className ?? ""}>
      <EChartsWrapper option={option} style={{ height: 100, width: "100%" }} />
    </div>
  );
}
