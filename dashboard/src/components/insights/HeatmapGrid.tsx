import type { InsightsHeatmapCell } from "../../lib/types.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const INTENSITY_CLASS: Record<number, string> = {
  0: "intensity-0 bg-[var(--bg2)]",
  1: "intensity-1 bg-[var(--teal)] opacity-20",
  2: "intensity-2 bg-[var(--teal)] opacity-40",
  3: "intensity-3 bg-[var(--teal)] opacity-65",
  4: "intensity-4 bg-[var(--teal)]",
};

interface HeatmapGridProps {
  heatmap: InsightsHeatmapCell[];
  className?: string;
}

export function HeatmapGrid({ heatmap, className }: HeatmapGridProps): JSX.Element {
  const byDay = new Map<number, InsightsHeatmapCell[]>();
  for (const cell of heatmap) {
    const arr = byDay.get(cell.day) ?? [];
    arr.push(cell);
    byDay.set(cell.day, arr);
  }

  return (
    <div className={`flex flex-col gap-0.5 ${className ?? ""}`}>
      {/* Hour axis labels at 0, 6, 12, 18 */}
      <div className="flex ml-8 mb-0.5">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center">
            {h % 6 === 0 ? (
              <span className="text-xxs text-dt-text2">{h}</span>
            ) : null}
          </div>
        ))}
      </div>
      {/* Rows: one per day */}
      {DAY_LABELS.map((label, d) => {
        const dayCells = byDay.get(d) ?? [];
        const sortedCells = [...dayCells].sort((a, b) => a.hour - b.hour);
        return (
          <div key={d} className="flex items-center gap-0.5">
            <span className="w-7 text-xxs text-dt-text2 text-right pr-1 shrink-0">
              {label}
            </span>
            {sortedCells.map((cell) => (
              <div
                key={cell.hour}
                data-testid={`heatmap-cell-${cell.day}-${cell.hour}`}
                className={`flex-1 h-3 rounded-sm ${INTENSITY_CLASS[cell.intensity] ?? INTENSITY_CLASS[0]}`}
                title={`${label} ${cell.hour}:00 — intensity ${cell.intensity}`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
