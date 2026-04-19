import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { InsightsHourlyBucket } from "../../lib/types.js";
import { EChartsWrapper } from "./EChartsWrapper.js";

interface HourlyBarsProps {
  hourly: InsightsHourlyBucket[];
  className?: string;
}

function getCSSVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

function findPeakBlock(
  hourly: InsightsHourlyBucket[]
): { start: number; pct: number } | null {
  const total = hourly.reduce((s, h) => s + h.tokensAvg, 0);
  if (total === 0) return null;
  let bestStart = 0;
  let bestSum = 0;
  for (let s = 0; s <= 20; s++) {
    const sum = hourly.slice(s, s + 4).reduce((acc, h) => acc + h.tokensAvg, 0);
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = s;
    }
  }
  return { start: bestStart, pct: Math.round((bestSum / total) * 100) };
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function buildHourlyBarsOption(
  hourly: InsightsHourlyBucket[]
): EChartsOption {
  const teal = getCSSVar("--teal", "#4B8A8A");
  const accent = getCSSVar("--accent", "#C2592E");
  const text2 = getCSSVar("--text-2", "#8B8780");

  const peak = findPeakBlock(hourly);
  const peakHour =
    peak !== null
      ? hourly
          .slice(peak.start, peak.start + 4)
          .reduce(
            (best, h) => (h.tokensAvg > best.tokensAvg ? h : best),
            hourly[peak.start]
          ).hour
      : -1;

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
    },
    grid: { left: 0, right: 0, top: 4, bottom: 20, containLabel: false },
    xAxis: {
      type: "category",
      data: hourly.map((h) => h.hour),
      axisLabel: { color: text2, fontSize: 8, interval: 5 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: "value",
      show: false,
    },
    series: [
      {
        type: "bar",
        data: hourly.map((h) => ({
          value: h.tokensAvg,
          itemStyle: {
            color: h.hour === peakHour && peak !== null ? accent : teal,
            opacity: h.hour === peakHour && peak !== null ? 1 : 0.5,
            borderRadius: [1, 1, 0, 0],
          },
        })),
      },
    ],
  };
}

export function HourlyBars({
  hourly,
  className,
}: HourlyBarsProps): JSX.Element {
  const peak = useMemo(() => findPeakBlock(hourly), [hourly]);
  const option = useMemo(() => buildHourlyBarsOption(hourly), [hourly]);

  const observation =
    peak !== null
      ? `You do ${peak.pct}% of your work between ${fmtHour(peak.start)} and ${fmtHour(peak.start + 4)}`
      : "No activity recorded in this period";

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <EChartsWrapper option={option} style={{ height: 80, width: "100%" }} />
      <p data-testid="hourly-observation" className="text-xs text-dt-text2">
        {observation}
      </p>
    </div>
  );
}
