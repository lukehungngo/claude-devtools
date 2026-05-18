import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChartsWrapper } from "./EChartsWrapper.js";

interface DailyPoint {
  date: string;
  tokensIn: number;
  tokensOut: number;
}

interface TrendChartProps {
  daily: DailyPoint[];
  className?: string;
}

function getCSSVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

export function buildTrendChartOption(daily: DailyPoint[]): EChartsOption {
  const teal = getCSSVar("--teal", "#4B8A8A");
  const purple = getCSSVar("--purple", "#8B6BAF");
  const border = getCSSVar("--border", "#E5E1D8");
  const text2 = getCSSVar("--text-2", "#8B8780");

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
    },
    legend: {
      show: false,
    },
    grid: { left: 0, right: 0, top: 8, bottom: 28, containLabel: true },
    xAxis: {
      type: "category",
      data: daily.map((d) => d.date.slice(5)),
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { color: text2, fontSize: 12 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: border } },
      axisLabel: { show: false },
    },
    series: [
      {
        name: "Tokens In",
        type: "line",
        data: daily.map((d) => d.tokensIn),
        stack: "total",
        smooth: true,
        color: teal,
        areaStyle: { color: teal, opacity: 0.25 },
        showSymbol: false,
        lineStyle: { width: 1.5, color: teal },
      },
      {
        name: "Tokens Out",
        type: "line",
        data: daily.map((d) => d.tokensOut),
        stack: "total",
        smooth: true,
        color: purple,
        areaStyle: { color: purple, opacity: 0.25 },
        showSymbol: false,
        lineStyle: { width: 1.5, color: purple },
      },
    ],
  };
}

export function TrendChart({ daily, className }: TrendChartProps): JSX.Element {
  const option = useMemo(() => buildTrendChartOption(daily), [daily]);

  if (daily.length === 0) {
    return (
      <div
        className={`h-28 flex items-center justify-center text-dt-text2 text-md font-mono ${className ?? ""}`}
      >
        No data
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <EChartsWrapper option={option} style={{ height: 120, width: "100%" }} />
    </div>
  );
}
