import { formatTokens } from "../../lib/cost";

type Verdict = "improving" | "stable" | "regressing";

interface WeeklyPoint {
  in: number;
  out: number;
}

export interface TrendEntry {
  name: string;
  calls: number;
  avgIn: number;
  avgOut: number;
  weekly: WeeklyPoint[];
  verdict: Verdict;
}

interface TrendRowProps {
  entry: TrendEntry;
}

const VERDICT_STYLES: Record<Verdict, string> = {
  improving: "text-dt-green bg-dt-green/10",
  stable: "text-dt-text2 bg-dt-bg2",
  regressing: "text-dt-red bg-dt-red/10",
};

const VERDICT_LABELS: Record<Verdict, string> = {
  improving: "IMPROVING",
  stable: "STABLE",
  regressing: "REGRESSING",
};

interface DualSparklineProps {
  weekly: WeeklyPoint[];
}

function DualSparkline({ weekly }: DualSparklineProps): JSX.Element {
  const W = 64;
  const H = 20;
  const n = weekly.length;

  if (n < 2) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--dt-border)" strokeWidth="1" />
      </svg>
    );
  }

  const maxIn = Math.max(...weekly.map((w) => w.in), 1);
  const maxTotal = Math.max(...weekly.map((w) => w.in + w.out), 1);

  function xPos(i: number): number {
    return (i / (n - 1)) * W;
  }

  function yIn(v: number): number {
    return H - (v / maxIn) * (H - 4) - 2;
  }

  function yTotal(v: number): number {
    return H - (v / maxTotal) * (H - 4) - 2;
  }

  const inPoints = weekly.map((w, i) => `${xPos(i)},${yIn(w.in)}`).join(" ");
  const totalPoints = weekly.map((w, i) => `${xPos(i)},${yTotal(w.in + w.out)}`).join(" ");

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      role="img"
      aria-label="trend sparkline"
    >
      <polyline
        points={inPoints}
        fill="none"
        stroke="var(--dt-teal)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={totalPoints}
        fill="none"
        stroke="var(--dt-purple)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="3 2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TrendRow({ entry }: TrendRowProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-dt-border last:border-0">
      <span className="flex-1 text-xs font-mono text-dt-text0 truncate min-w-0">{entry.name}</span>
      <span
        data-testid="trend-row-calls"
        className="text-xs font-mono text-dt-text2 flex-shrink-0 w-16 text-right tabular-nums"
      >
        {entry.calls} calls
      </span>
      <span className="text-xs font-mono text-dt-text2 flex-shrink-0 w-20 text-right tabular-nums hidden sm:block">
        {formatTokens(entry.avgIn)} avg
      </span>
      <DualSparkline weekly={entry.weekly} />
      <span
        data-testid="trend-row-verdict"
        className={[
          "text-xxs font-mono font-semibold px-1.5 py-0.5 rounded flex-shrink-0 w-24 text-center",
          VERDICT_STYLES[entry.verdict],
        ].join(" ")}
      >
        {VERDICT_LABELS[entry.verdict]}
      </span>
    </div>
  );
}
