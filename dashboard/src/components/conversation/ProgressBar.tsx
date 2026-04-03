import { memo } from "react";

interface ProgressBarProps {
  label: string;
  completed: number;
  total: number;
}

export const ProgressBar = memo(function ProgressBar({
  label,
  completed,
  total,
}: ProgressBarProps): JSX.Element | null {
  if (total === 0) {
    return null;
  }

  const percent = Math.min(100, (completed / total) * 100);
  const isComplete = completed === total;

  return (
    <div className="my-2 px-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] flex-1" style={{ color: "var(--t2)" }}>
          {label}
        </span>
        <span
          className="text-[11px] text-right"
          style={{ color: isComplete ? "var(--grn)" : "var(--t2)" }}
        >
          {completed}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        className="h-1 rounded-sm"
        style={{ background: "var(--bg-h)" }}
      >
        <div
          className="h-1 rounded-sm"
          style={{
            width: `${percent}%`,
            background: "var(--grn)",
          }}
        />
      </div>
    </div>
  );
});
