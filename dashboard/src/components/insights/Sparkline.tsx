interface SparklineProps {
  data: number[];
  color?: "teal" | "purple";
  className?: string;
  showArea?: boolean;
  width?: number;
  height?: number;
}

const DEFAULT_W = 72;
const DEFAULT_H = 36;
const PAD = 2;

function computeSparkPoints(data: number[], w: number, h: number): string {
  if (data.length < 2) return `${PAD},${h - PAD} ${w - PAD},${PAD}`;
  const chartW = w - PAD * 2;
  const chartH = h - PAD * 2;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  if (range === 0) return `${PAD},${h / 2} ${w - PAD},${h / 2}`;
  return data
    .map((v, i) => {
      const x = PAD + (i / (data.length - 1)) * chartW;
      const y = PAD + chartH - ((v - min) / range) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildAreaPath(data: number[], w: number, h: number): string {
  if (data.length < 2) return "";
  const chartW = w - PAD * 2;
  const chartH = h - PAD * 2;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  const bottom = h - PAD;
  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * chartW;
    const y = range === 0 ? h / 2 : PAD + chartH - ((v - min) / range) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${PAD},${bottom} L ${pts.join(" L ")} L ${w - PAD},${bottom} Z`;
}

export function Sparkline({
  data,
  color = "teal",
  className,
  showArea = false,
  width = DEFAULT_W,
  height = DEFAULT_H,
}: SparklineProps): JSX.Element {
  const points = computeSparkPoints(data, width, height);
  const colorVar = color === "purple" ? "var(--cat-purple)" : "var(--teal)";
  const gradId = `spark-grad-${color}-${width}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={className}
      style={{ overflow: "visible" }}
    >
      {showArea && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorVar} stopOpacity="0.25" />
            <stop offset="100%" stopColor={colorVar} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {showArea && data.length >= 2 && (
        <path d={buildAreaPath(data, width, height)} fill={`url(#${gradId})`} />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={colorVar}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
