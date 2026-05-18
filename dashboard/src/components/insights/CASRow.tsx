import { Sparkline } from "./Sparkline";

export type CASRowTrend = "improving" | "stable" | "regressing";

export interface CASRowProps {
  name: string;
  daily: number[];
  count: number;
  trend: CASRowTrend;
  badgeIndex: number;
  sparklineColor?: "teal" | "purple";
}

// Phase 2: var-based palette. Phase 1 of design hygiene moved away from raw Tailwind hex
// to canonical design tokens. Order is preserved so existing indices keep stable colors.
export const BADGE_PALETTE = [
  "var(--span-pm)",
  "var(--span-swe)",
  "var(--span-doc)",
  "var(--span-qa)",
  "var(--span-bug)",
  "var(--span-rev)",
  "var(--span-swe2)",
  "var(--teal)",
];

const TREND_CONFIG: Record<CASRowTrend, { symbol: string; label: string; classes: string }> = {
  improving: {
    symbol: "↑",
    label: "IMPROVING",
    classes: "text-dt-green bg-dt-green-dim",
  },
  stable: {
    symbol: "→",
    label: "STABLE",
    classes: "text-dt-text2 bg-dt-bg2",
  },
  regressing: {
    symbol: "↓",
    label: "REGRESSING",
    classes: "text-dt-red bg-dt-red-dim",
  },
};

export function abbreviateName(name: string): string {
  let base: string;
  const colonIdx = name.lastIndexOf(":");
  if (colonIdx !== -1) {
    base = name.slice(colonIdx + 1);
  } else if (name.startsWith("/")) {
    base = name.slice(1);
  } else {
    base = name;
  }
  const padded = (base + "???").slice(0, 3);
  return padded.toUpperCase();
}

export function CASRow({
  name,
  daily,
  count,
  trend,
  badgeIndex,
  sparklineColor = "teal",
}: CASRowProps): JSX.Element {
  const tc = TREND_CONFIG[trend];
  const badgeColor = BADGE_PALETTE[badgeIndex % BADGE_PALETTE.length];

  return (
    <div
      className="items-center gap-2.5 px-2 py-2 rounded-dt-sm hover:bg-dt-bg2 transition-colors cursor-default"
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr 72px 48px 92px",
        alignItems: "center",
      }}
    >
      {/* Badge */}
      <div
        className="font-mono text-md font-bold uppercase tracking-wide text-white flex items-center justify-center rounded flex-shrink-0"
        style={{ width: 32, height: 22, background: badgeColor }}
      >
        {abbreviateName(name)}
      </div>

      {/* Name */}
      <div className="min-w-0" title={name}>
        <div className="text-md font-semibold text-dt-text0 font-mono truncate">{name}</div>
      </div>

      {/* Sparkline */}
      <div className="flex items-center">
        <Sparkline data={daily} color={sparklineColor} width={72} height={28} />
      </div>

      {/* Count */}
      <div className="text-right">
        <div className="text-md font-mono font-semibold text-dt-text0 leading-none">
          {count.toLocaleString()}
        </div>
      </div>

      {/* Trend pill */}
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-dt-xs text-md font-mono font-semibold ${tc.classes}`}
      >
        <span>{tc.symbol}</span>
        <span>{tc.label}</span>
      </div>
    </div>
  );
}
