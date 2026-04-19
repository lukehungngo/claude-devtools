import { useState } from "react";
import type { InsightsHourlyBucket } from "../../lib/types.js";

const SVG_W = 560;
const SVG_H = 108;
const BAR_W = 18;
const BAR_GAP = 5;
const MAX_BAR_H = 92;
const TOTAL_W = (BAR_W + BAR_GAP) * 24 - BAR_GAP; // 547
const START_X = (SVG_W - TOTAL_W) / 2; // 6.5

const X_LABEL_HOURS: Record<number, string> = {
  0: "12AM",
  6: "6AM",
  12: "12PM",
  18: "6PM",
  23: "12AM",
};

function fmtTok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function findPeakBlock(
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

export function fmtObsHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

interface TooltipState {
  x: number;
  y: number;
  text: string;
}

interface HourlyBarsProps {
  hourly: InsightsHourlyBucket[];
  className?: string;
}

export function HourlyBars({ hourly, className }: HourlyBarsProps): JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const peak = findPeakBlock(hourly);
  const maxAvg = hourly.reduce((m, h) => Math.max(m, h.tokensAvg), 0);

  const isPeakHour = (h: number): boolean =>
    peak !== null && h >= peak.start && h < peak.start + 4;

  const observation =
    peak !== null
      ? `You do ${peak.pct}% of your token work between ${fmtObsHour(peak.start)} and ${fmtObsHour(peak.start + 4)}`
      : "No activity recorded in this period";

  return (
    <div className={`flex flex-col ${className ?? ""}`}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${SVG_W} 120`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block", width: "100%" }}
          onMouseLeave={() => setTooltip(null)}
        >
          {hourly.map((bucket, i) => {
            const barH =
              maxAvg > 0 ? Math.round((bucket.tokensAvg / maxAvg) * MAX_BAR_H) : 0;
            const x = START_X + i * (BAR_W + BAR_GAP);
            const y = SVG_H - barH;
            const fill = isPeakHour(bucket.hour)
              ? "var(--accent)"
              : "color-mix(in srgb, var(--accent) 25%, var(--bg-2))";
            return (
              <rect
                key={bucket.hour}
                data-testid="hb-bar"
                x={x}
                y={y}
                width={BAR_W}
                height={Math.max(barH, 1)}
                rx={3}
                fill={fill}
                style={{ cursor: "default" }}
                onMouseEnter={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    text: `${fmtObsHour(bucket.hour)} · avg ${fmtTok(bucket.tokensAvg)} tokens`,
                  })
                }
                onMouseMove={(e) =>
                  setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null))
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
          {/* X-axis labels */}
          {Object.entries(X_LABEL_HOURS).map(([hourStr, label]) => {
            const h = Number(hourStr);
            const x = START_X + h * (BAR_W + BAR_GAP) + BAR_W / 2;
            return (
              <text
                key={label + h}
                x={x}
                y={118}
                fontFamily="var(--font)"
                fontSize={9}
                fill="var(--text-2)"
                textAnchor="middle"
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
      <p
        data-testid="hourly-observation"
        className="font-mono text-sm text-dt-text1 mt-2.5"
        style={{ lineHeight: 1.5 }}
      >
        {peak !== null ? (
          <>
            You do{" "}
            <strong className="text-dt-accent font-semibold">{peak.pct}%</strong>
            {" "}of your token work between{" "}
            <strong className="text-dt-accent font-semibold">
              {fmtObsHour(peak.start)}
            </strong>
            {" "}and{" "}
            <strong className="text-dt-accent font-semibold">
              {fmtObsHour(peak.start + 4)}
            </strong>
          </>
        ) : (
          observation
        )}
      </p>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y - 32,
            zIndex: 9999,
            pointerEvents: "none",
          }}
          className="bg-dt-bg3 border border-dt-border rounded px-2 py-1 text-xs font-mono text-dt-text0 whitespace-nowrap shadow-sm"
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
