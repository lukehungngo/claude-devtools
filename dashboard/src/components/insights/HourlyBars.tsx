import { useMemo, useState, useRef } from "react";
import type { InsightsHourlyBucket } from "../../lib/types.js";

interface HourlyBarsProps {
  hourly: InsightsHourlyBucket[];
  className?: string;
}

function findPeakBlock(hourly: InsightsHourlyBucket[]): { start: number; pct: number } | null {
  const total = hourly.reduce((s, h) => s + h.tokensAvg, 0);
  if (total === 0) return null;
  let bestStart = 0, bestSum = 0;
  for (let s = 0; s <= 20; s++) {
    const sum = hourly.slice(s, s + 4).reduce((acc, h) => acc + h.tokensAvg, 0);
    if (sum > bestSum) { bestSum = sum; bestStart = s; }
  }
  return { start: bestStart, pct: Math.round((bestSum / total) * 100) };
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

interface TooltipState {
  hour: number;
  tokensAvg: number;
  x: number; // percent of SVG width (0-100)
}

export function HourlyBars({ hourly, className }: HourlyBarsProps): JSX.Element {
  const peak = useMemo(() => findPeakBlock(hourly), [hourly]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const maxVal = Math.max(...hourly.map(h => h.tokensAvg), 1);

  const peakHour = peak !== null
    ? hourly
        .slice(peak.start, peak.start + 4)
        .reduce((best, h) => (h.tokensAvg > best.tokensAvg ? h : best), hourly[peak.start])
        .hour
    : -1;

  const SVG_H = 80;
  const BAR_W = 100 / 24;

  function handleBarEnter(h: InsightsHourlyBucket, i: number) {
    const cx = i * BAR_W + BAR_W / 2; // percent of SVG width
    setTooltip({ hour: h.hour, tokensAvg: h.tokensAvg, x: cx });
  }

  return (
    <div className={`flex flex-col ${className ?? ""}`} ref={wrapRef}>
      {/* SVG bars + tooltip anchor */}
      <div style={{ position: "relative" }}>
        {/* Tooltip */}
        {tooltip !== null && tooltip.tokensAvg > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${tooltip.x}%`,
              top: 0,
              transform: "translate(-50%, calc(-100% - 6px))",
              background: "var(--bg0)",
              border: "1px solid var(--bd)",
              borderRadius: 6,
              padding: "6px 10px",
              pointerEvents: "none",
              zIndex: 20,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,.25)",
            }}
          >
            <div className="font-mono text-md font-semibold text-dt-text0">
              {fmtHour(tooltip.hour)}–{fmtHour((tooltip.hour + 1) % 24)}
            </div>
            <div className="font-mono text-md text-dt-text2 mt-0.5">
              avg <span className="text-dt-text0 font-semibold">{fmtTokens(tooltip.tokensAvg)}</span> tokens
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 100 ${SVG_H}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: SVG_H }}
        >
          {hourly.map((h, i) => {
            const barH = Math.max((h.tokensAvg / maxVal) * (SVG_H - 2), h.tokensAvg > 0 ? 1 : 0);
            const isPeak = h.hour === peakHour && peak !== null;
            const isHovered = tooltip?.hour === h.hour;
            return (
              <rect
                key={h.hour}
                x={i * BAR_W + BAR_W * 0.1}
                y={SVG_H - barH}
                width={BAR_W * 0.8}
                height={barH}
                fill={isPeak || isHovered ? "var(--acc)" : "var(--teal)"}
                opacity={isPeak || isHovered ? 1 : 0.5}
                rx={0.5}
                style={{ cursor: h.tokensAvg > 0 ? "default" : undefined, transition: "fill .1s, opacity .1s" }}
                onMouseEnter={() => handleBarEnter(h, i)}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>
      </div>

      {/* X-axis hour labels */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(24, 1fr)",
        fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t3)",
        marginTop: 4,
      }}>
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} style={{
            textAlign: "center",
            visibility: h % 6 === 0 ? "visible" : "hidden",
          }}>{h}</span>
        ))}
      </div>

      {/* Observation */}
      <p
        data-testid="hourly-observation"
        style={{
          fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t2)",
          marginTop: 10, lineHeight: 1.5,
        }}
      >
        {peak !== null ? (
          <>
            You do{" "}
            <strong style={{ color: "var(--acc)" }}>{peak.pct}%</strong>
            {" "}of your work between{" "}
            <strong style={{ color: "var(--acc)" }}>{fmtHour(peak.start)}</strong>
            {" "}and{" "}
            <strong style={{ color: "var(--acc)" }}>{fmtHour(peak.start + 4)}</strong>
          </>
        ) : (
          "No activity recorded in this period"
        )}
      </p>
    </div>
  );
}
