import type { InsightsHourlyBucket } from "../../lib/types.js";

const VB_W = 240;
const VB_H = 60;
const BAR_W = 8;
const BAR_GAP = 2;

interface HourlyBarsProps {
  hourly: InsightsHourlyBucket[];
  className?: string;
}

function findPeakBlock(hourly: InsightsHourlyBucket[]): { start: number; pct: number } | null {
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

export function HourlyBars({ hourly, className }: HourlyBarsProps): JSX.Element {
  const maxAvg = Math.max(...hourly.map((h) => h.tokensAvg), 0);
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

  const observation =
    peak !== null
      ? `You do ${peak.pct}% of your work between ${fmtHour(peak.start)} and ${fmtHour(peak.start + 4)}`
      : "No activity recorded in this period";

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        aria-label="Hourly token distribution"
      >
        {hourly.map((bucket, i) => {
          const barH = maxAvg === 0 ? 0 : (bucket.tokensAvg / maxAvg) * VB_H;
          const x = i * (BAR_W + BAR_GAP);
          const y = VB_H - barH;
          const isPeak = bucket.hour === peakHour && peak !== null;
          return (
            <rect
              key={bucket.hour}
              data-testid={`hourly-bar-${bucket.hour}`}
              x={x}
              y={y}
              width={BAR_W}
              height={barH}
              fill={isPeak ? "var(--accent)" : "var(--teal)"}
              fillOpacity={isPeak ? 1 : 0.5}
              rx={1}
            />
          );
        })}
      </svg>
      <p
        data-testid="hourly-observation"
        className="text-xs text-dt-text2"
      >
        {observation}
      </p>
    </div>
  );
}
