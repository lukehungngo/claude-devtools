import type { InsightsHeatmapCell } from "../../lib/types.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Intensity → background CSS value
function intensityBg(intensity: 0 | 1 | 2 | 3 | 4): string {
  switch (intensity) {
    case 0: return "var(--bg-2)";
    case 1: return "color-mix(in srgb, var(--accent) 15%, var(--bg-2))";
    case 2: return "color-mix(in srgb, var(--accent) 32%, var(--bg-2))";
    case 3: return "color-mix(in srgb, var(--accent) 55%, var(--bg-2))";
    case 4: return "var(--accent)";
  }
}

export function findPeakCell(heatmap: InsightsHeatmapCell[]): InsightsHeatmapCell | null {
  let peak: InsightsHeatmapCell | null = null;
  for (const cell of heatmap) {
    if (cell.intensity === 4 && (peak === null || cell.intensity > peak.intensity)) {
      peak = cell;
    }
  }
  return peak;
}

export function fmtHeatmapHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12AM";
  if (hour === 12) return "12PM";
  return hour < 12 ? `${hour}AM` : `${hour - 12}PM`;
}

function peakLabel(peak: InsightsHeatmapCell): string {
  return `Peak: ${DAY_LABELS[peak.day] ?? "?"} ${fmtHeatmapHour(peak.hour)}`;
}

interface HeatmapGridProps {
  heatmap: InsightsHeatmapCell[];
  className?: string;
}

export function HeatmapGrid({ heatmap, className }: HeatmapGridProps): JSX.Element {
  const peak = findPeakCell(heatmap);

  // Build a lookup: "day-hour" → cell
  const cellMap = new Map<string, InsightsHeatmapCell>();
  for (const c of heatmap) {
    cellMap.set(`${c.day}-${c.hour}`, c);
  }

  const SWATCHES: Array<0 | 1 | 2 | 3 | 4> = [0, 1, 2, 3, 4];

  return (
    <div className={className ?? ""}>
      <div className="flex gap-0">
        {/* Day labels (y-axis) */}
        <div
          className="flex flex-col justify-between flex-shrink-0 font-mono"
          style={{ width: 44, paddingRight: 8, paddingTop: 2, paddingBottom: 22 }}
        >
          {DAY_LABELS.map((label) => (
            <span
              key={label}
              data-testid="hm-day-label"
              className="font-mono text-xxs text-dt-text2 flex items-center justify-end"
              style={{ height: 14 }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Grid + labels */}
        <div className="flex-1 min-w-0">
          {/* 7 rows × 24 cols */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(24, 1fr)",
              gap: 2,
            }}
          >
            {Array.from({ length: 7 }, (_, d) =>
              Array.from({ length: 24 }, (_, h) => {
                const cell = cellMap.get(`${d}-${h}`);
                const intensity = cell?.intensity ?? 0;
                const isPeak = peak !== null && peak.day === d && peak.hour === h;
                return (
                  <div
                    key={`${d}-${h}`}
                    data-testid={isPeak ? "hm-cell-peak" : "hm-cell"}
                    title={`${DAY_LABELS[d]} ${fmtHeatmapHour(h)}`}
                    className="cursor-default transition-transform hover:scale-125 hover:relative hover:z-10"
                    style={{
                      aspectRatio: "1",
                      borderRadius: 2,
                      background: intensityBg(intensity),
                      ...(isPeak
                        ? {
                            outline: "2px solid var(--accent)",
                            outlineOffset: 1,
                            transform: "scale(1.3)",
                            zIndex: 2,
                            position: "relative",
                          }
                        : {}),
                    }}
                  />
                );
              })
            )}
          </div>

          {/* Hour x-labels (every 3 hours) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(24, 1fr)",
              gap: 2,
              marginTop: 5,
            }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                data-testid="hm-hour-label"
                className="font-mono text-center text-dt-text2"
                style={{
                  fontSize: 8,
                  visibility: h % 3 === 0 ? "visible" : "hidden",
                }}
              >
                {fmtHeatmapHour(h)}
              </span>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center mt-2 font-mono text-dt-text2" style={{ gap: 5, fontSize: 9 }}>
            <span>Less</span>
            {SWATCHES.map((level) => (
              <div
                key={level}
                data-testid="hm-swatch"
                style={{ width: 10, height: 10, borderRadius: 2, background: intensityBg(level) }}
              />
            ))}
            <span>More</span>
            {peak !== null && (
              <span className="ml-auto text-dt-text1" style={{ fontSize: 9 }}>
                {peakLabel(peak)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
