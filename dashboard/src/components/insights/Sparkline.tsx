interface SparklineProps {
  data: number[];
  color?: "teal" | "purple";
  className?: string;
}

const STATIC_FALLBACK_POINTS = "0,18 16,12 32,8 48,14 64,4";

const W = 64;
const H = 20;
const PAD = 2;
const CHART_W = W - PAD * 2; // 60
const CHART_H = H - PAD * 2; // 16

function computePoints(data: number[]): string {
  if (data.length < 2) {
    return STATIC_FALLBACK_POINTS;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;

  if (range === 0) {
    return STATIC_FALLBACK_POINTS;
  }

  return data
    .map((v, i) => {
      const x = PAD + (i / (data.length - 1)) * CHART_W;
      const y = PAD + CHART_H - ((v - min) / range) * CHART_H;
      return `${x},${y}`;
    })
    .join(" ");
}

export function Sparkline({ data, color = "teal", className }: SparklineProps) {
  const points = computePoints(data);
  const colorClass = color === "purple" ? "text-dt-purple" : "text-dt-teal";

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className={[colorClass, className].filter(Boolean).join(" ")}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
