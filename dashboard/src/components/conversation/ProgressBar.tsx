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
    <div style={{ margin: "8px 0", padding: "0 8px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: "var(--t2)", flex: 1 }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: isComplete ? "var(--grn)" : "var(--t2)",
            textAlign: "right",
          }}
        >
          {completed}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        style={{
          height: 4,
          background: "var(--bg-h)",
          borderRadius: 2,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: 4,
            background: "var(--grn)",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
});
