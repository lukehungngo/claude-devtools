import { Minimize2 } from "lucide-react";

interface ContextCompactProps {
  percent: number;
  onCompact: () => void;
}

function getBarColor(percent: number): string {
  if (percent >= 80) return "var(--red)";
  if (percent >= 50) return "var(--amb)";
  return "var(--grn)";
}

export function ContextCompact({ percent, onCompact }: ContextCompactProps) {
  const color = getBarColor(percent);
  const showCompact = percent > 50;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1">
          <span
            style={{
              fontSize: 8,
              color: "var(--t3)",
              letterSpacing: ".4px",
              textTransform: "uppercase",
            }}
          >
            Context
          </span>
          <span
            className="font-mono font-medium"
            style={{ fontSize: 12, color: "var(--t1)" }}
          >
            {percent}%
          </span>
        </div>
        <div
          style={{
            width: 42,
            height: 4,
            borderRadius: 2,
            background: "var(--bd)",
          }}
        >
          <div
            data-testid="context-bar-fill"
            style={{
              width: `${Math.min(percent, 100)}%`,
              height: "100%",
              borderRadius: 2,
              background: color,
              transition: "width 0.3s ease, background 0.3s ease",
            }}
          />
        </div>
      </div>
      {showCompact && (
        <button
          onClick={onCompact}
          title="Compact context"
          style={{
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color,
            cursor: "pointer",
            borderRadius: 4,
            padding: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--bg-h)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          <Minimize2 size={12} />
        </button>
      )}
    </div>
  );
}
