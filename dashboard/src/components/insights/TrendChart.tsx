interface DailyPoint {
  date: string; // "YYYY-MM-DD"
  tokensIn: number;
  tokensOut: number;
}

interface TrendChartProps {
  daily: DailyPoint[];
  className?: string;
}

const VB_W = 400;
const VB_H = 100;

function xPos(i: number, n: number): number {
  return n <= 1 ? 200 : (i / (n - 1)) * VB_W;
}

function yPos(v: number, maxTotal: number): number {
  return VB_H - (v / maxTotal) * VB_H;
}

function buildAreaPath(
  topYs: number[],
  bottomYs: number[],
  xs: number[]
): string {
  const n = xs.length;
  // Forward along top edge
  const top = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${topYs[i].toFixed(1)}`)
    .join(" ");
  // Back along bottom edge (reversed)
  const bottom = [...Array(n)]
    .map((_, ri) => {
      const i = n - 1 - ri;
      return `L${xs[i].toFixed(1)},${bottomYs[i].toFixed(1)}`;
    })
    .join(" ");
  return `${top} ${bottom} Z`;
}

export function TrendChart({ daily, className }: TrendChartProps): JSX.Element {
  if (daily.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center text-dt-text2 text-xs font-mono">
        No data
      </div>
    );
  }

  const n = daily.length;
  const maxTotal = Math.max(...daily.map((d) => d.tokensIn + d.tokensOut), 1);

  const xs = daily.map((_, i) => xPos(i, n));
  const yIns = daily.map((d) => yPos(d.tokensIn, maxTotal));
  const yTotals = daily.map((d) => yPos(d.tokensIn + d.tokensOut, maxTotal));
  const zeroYs = daily.map(() => VB_H);

  const insAreaPath = buildAreaPath(yIns, zeroYs, xs);
  const outAreaPath = buildAreaPath(yTotals, yIns, xs);

  const insPolylinePoints = xs.map((x, i) => `${x.toFixed(1)},${yIns[i].toFixed(1)}`).join(" ");
  const totalPolylinePoints = xs
    .map((x, i) => `${x.toFixed(1)},${yTotals[i].toFixed(1)}`)
    .join(" ");

  // Date labels: show at most 7; always include index 0 and index n-1
  const labelStep = Math.max(1, Math.ceil(n / 7));
  const indices = [
    ...new Set(
      daily.reduce<number[]>((acc, _, i) => {
        if (i === 0 || i === n - 1 || i % labelStep === 0) acc.push(i);
        return acc;
      }, [])
    ),
  ].sort((a, b) => a - b);

  const gridYs = [75, 50, 25];

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <svg
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Token usage trend chart"
        className="w-full"
        style={{ height: "100px" }}
      >
        {/* Grid lines */}
        {gridYs.map((y) => (
          <line
            key={y}
            x1={0}
            y1={y}
            x2={400}
            y2={y}
            stroke="var(--border)"
            strokeWidth="0.5"
          />
        ))}

        {/* tokensIn filled area (teal, bottom stack) */}
        <path
          d={insAreaPath}
          fill="var(--teal)"
          fillOpacity="0.25"
          vectorEffect="non-scaling-stroke"
        />

        {/* tokensOut filled area (purple, stacked on top) */}
        <path
          d={outAreaPath}
          fill="var(--purple)"
          fillOpacity="0.25"
          vectorEffect="non-scaling-stroke"
        />

        {/* tokensIn stroke line (teal edge) */}
        <polyline
          points={insPolylinePoints}
          fill="none"
          stroke="var(--teal)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* total stroke line (purple edge) */}
        <polyline
          points={totalPolylinePoints}
          fill="none"
          stroke="var(--purple)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Date labels (HTML, not SVG — avoids text distortion) */}
      <div className="relative" style={{ height: "16px" }}>
        {indices.map((i) => {
          const xPct = n <= 1 ? 50 : (i / (n - 1)) * 100;
          const text = daily[i].date.slice(5);
          return (
            <span
              key={i}
              className="absolute text-xxs font-mono text-dt-text2"
              style={{ left: `${xPct}%`, transform: "translateX(-50%)" }}
            >
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
