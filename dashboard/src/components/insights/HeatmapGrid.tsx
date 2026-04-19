import { useState } from "react";
import type { InsightsHeatmapCell } from "../../lib/types.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

export function HeatmapGrid({ heatmap, className }: HeatmapGridProps): JSX.Element {
  const [hovered, setHovered] = useState<{ day: number; hour: number } | null>(null);

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

  return (
    <div className={className ?? ""}>
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
                const intensity = grid[day][hour];
                const isPeak = day === peakDay && hour === peakHour;
                const isHovered = hovered?.day === day && hovered?.hour === hour;
                return (
                  <div
                    key={`${day}-${hour}`}
                    title={`${DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00`}
                    onMouseEnter={() => setHovered({ day, hour })}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 2,
                      background: CELL_COLOR[intensity],
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
