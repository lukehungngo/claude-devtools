import { useState, useRef } from "react";
import type { InsightsHeatmapCell } from "../../lib/types.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const INTENSITY_LABELS = ["No activity", "Light", "Moderate", "Heavy", "Peak"];

const CELL_COLOR: Record<number, string> = {
  0: "var(--bg-s)",
  1: "var(--acc-bg)",
  2: "var(--acc-bg-strong)",
  3: "rgba(194,89,46,.35)",
  4: "var(--acc)",
};

interface HeatmapGridProps {
  heatmap: InsightsHeatmapCell[];
  className?: string;
}

interface TooltipState {
  day: number;
  hour: number;
  x: number;
  y: number;
}

export function HeatmapGrid({ heatmap, className }: HeatmapGridProps): JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build [day][hour] → intensity lookup
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let peakDay = -1, peakHour = -1, peakIntensity = -1;
  for (const cell of heatmap) {
    if (cell.day >= 0 && cell.day < 7 && cell.hour >= 0 && cell.hour < 24) {
      grid[cell.day][cell.hour] = cell.intensity;
      if (cell.intensity > peakIntensity) {
        peakIntensity = cell.intensity;
        peakDay = cell.day;
        peakHour = cell.hour;
      }
    }
  }

  function handleCellEnter(e: React.MouseEvent<HTMLDivElement>, day: number, hour: number) {
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const tr = e.currentTarget.getBoundingClientRect();
    setTooltip({
      day,
      hour,
      x: tr.left - cr.left + tr.width / 2,
      y: tr.top - cr.top,
    });
  }

  const intensity = tooltip !== null ? grid[tooltip.day][tooltip.hour] : 0;

  return (
    <div className={className ?? ""} ref={containerRef} style={{ position: "relative" }}>
      {/* Tooltip */}
      {tooltip !== null && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
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
          <div className="font-mono text-sm font-semibold text-dt-text0">
            {DAY_LABELS[tooltip.day]}&nbsp;
            {String(tooltip.hour).padStart(2, "0")}:00–{String((tooltip.hour + 1) % 24).padStart(2, "0")}:00
          </div>
          <div className="font-mono text-sm text-dt-text2 flex items-center gap-1.5 mt-0.5">
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: CELL_COLOR[intensity],
                border: intensity === 0 ? "1px solid var(--bd)" : undefined,
              }}
            />
            {INTENSITY_LABELS[intensity]}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 0 }}>
        {/* Y-axis day labels */}
        <div style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          width: 36, paddingRight: 6, flexShrink: 0,
          paddingTop: 2, paddingBottom: 20,
        }}>
          {DAY_LABELS.map(d => (
            <span key={d} style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
              lineHeight: 1, height: 14, display: "flex", alignItems: "center",
              justifyContent: "flex-end",
            }}>{d}</span>
          ))}
        </div>

        {/* Grid body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 7×24 CSS grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
            {Array.from({ length: 7 }, (_, day) =>
              Array.from({ length: 24 }, (_, hour) => {
                const cellIntensity = grid[day][hour];
                const isPeak = day === peakDay && hour === peakHour;
                const isHovered = tooltip?.day === day && tooltip?.hour === hour;
                return (
                  <div
                    key={`${day}-${hour}`}
                    onMouseEnter={(e) => handleCellEnter(e, day, hour)}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 2,
                      background: CELL_COLOR[cellIntensity],
                      outline: isPeak ? "2px solid var(--acc)" : undefined,
                      outlineOffset: isPeak ? 1 : undefined,
                      transform: isPeak || isHovered ? "scale(1.3)" : undefined,
                      zIndex: isPeak || isHovered ? 2 : undefined,
                      position: isPeak || isHovered ? "relative" : undefined,
                      transition: "transform .12s",
                      cursor: "default",
                    }}
                  />
                );
              })
            )}
          </div>

          {/* X-axis hour labels */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2,
            marginTop: 5,
          }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{
                fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
                textAlign: "center",
                visibility: h % 6 === 0 ? "visible" : "hidden",
              }}>{h}</span>
            ))}
          </div>

          {/* Legend */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            marginTop: 8,
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
          }}>
            <span>Less</span>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: 2,
                background: CELL_COLOR[i],
              }} />
            ))}
            <span>More</span>
            {peakHour >= 0 && (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--t2)" }}>
                Peak {String(peakHour).padStart(2, "0")}:00 {DAY_LABELS[peakDay]}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
