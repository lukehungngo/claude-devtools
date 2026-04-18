import { useState, useEffect } from "react";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useInsightsAggregate } from "../hooks/useInsightsAggregate";
import { formatCost, formatTokens } from "../lib/cost";
import { Sparkline } from "../components/insights/Sparkline";
import { TrendChart } from "../components/insights/TrendChart";
import { useInsightsActivity } from "../hooks/useInsightsActivity.js";
import { HeatmapGrid } from "../components/insights/HeatmapGrid.js";
import { HourlyBars } from "../components/insights/HourlyBars.js";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "all";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

const REPO_OPTIONS = [{ value: "all", label: "All repos" }];

const PLACEHOLDER_SECTIONS = [
  "Model Mix",
  "Top Consumers",
  "Commands",
  "Agents",
  "Skills",
  "Efficiency Hints",
];

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

interface SegPillProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}

function SegPill({ options, value, onChange, testId }: SegPillProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-0.5 bg-dt-bg2 border border-dt-border rounded-full p-0.5"
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        const buttonTestId = testId
          ? `${testId.replace("-pill", "")}-${opt.value}`
          : undefined;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={buttonTestId}
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={[
              "px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold transition-all",
              isActive
                ? "bg-dt-bg1 text-dt-accent"
                : "text-dt-text2 hover:text-dt-text1",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface PlaceholderCardProps {
  title: string;
  testId: string;
}

function PlaceholderCard({ title, testId }: PlaceholderCardProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      className="bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3"
    >
      <div className="text-md font-semibold text-dt-text2 font-mono tracking-wide">
        {title}
      </div>
      <div className="h-2.5 rounded bg-dt-bg2 w-4/5" />
      <div className="h-2.5 rounded bg-dt-bg2 w-3/5" />
      <div className="h-2.5 rounded bg-dt-bg2 w-2/5" />
    </div>
  );
}

interface DeltaChipProps {
  value: number | null;
  testId?: string;
}

function DeltaChip({ value, testId }: DeltaChipProps): JSX.Element {
  if (value === null) {
    return (
      <span data-testid={testId} className="text-dt-text2 text-xxs font-mono">
        —
      </span>
    );
  }
  const pct = (Math.abs(value) * 100).toFixed(1);
  const positive = value >= 0;
  return (
    <span
      data-testid={testId}
      className={[
        "text-xxs font-mono font-semibold px-1 py-0.5 rounded-dt-xs",
        positive
          ? "text-dt-green bg-dt-green/10"
          : "text-dt-red bg-dt-red/10",
      ].join(" ")}
    >
      {positive ? "+" : "-"}{pct}%
    </span>
  );
}

function SparklinePlaceholder(): JSX.Element {
  return (
    <svg
      width="64"
      height="20"
      viewBox="0 0 64 20"
      className="text-dt-accent opacity-40"
      aria-hidden="true"
    >
      <polyline
        points="0,18 16,12 32,8 48,14 64,4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface HeadlineTileProps {
  label: string;
  value: string;
  delta: number | null;
  deltaTestId?: string;
  testId?: string;
  sparklineData?: number[];
  sparklineColor?: "teal" | "purple";
}

function HeadlineTile({
  label,
  value,
  delta,
  deltaTestId,
  testId,
  sparklineData,
  sparklineColor,
}: HeadlineTileProps): JSX.Element {
  const sparkline =
    sparklineData && sparklineData.length > 0 ? (
      <Sparkline data={sparklineData} color={sparklineColor} />
    ) : (
      <SparklinePlaceholder />
    );
  return (
    <div
      data-testid={testId}
      className="bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-dt-text2 tracking-wide">{label}</span>
        {sparkline}
      </div>
      <div className="text-2xl font-bold text-dt-text0 font-mono leading-none">{value}</div>
      <DeltaChip value={delta} testId={deltaTestId} />
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaTestId?: string;
  testId?: string;
}

function StatTile({
  label,
  value,
  delta,
  deltaTestId,
  testId,
}: StatTileProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      className="bg-dt-bg1 border border-dt-border rounded-dt p-4 flex flex-col gap-1.5"
    >
      <span className="text-xs font-mono text-dt-text2 tracking-wide">{label}</span>
      <div className="text-xl font-bold text-dt-text0 font-mono leading-none">{value}</div>
      {delta !== undefined && <DeltaChip value={delta} testId={deltaTestId} />}
    </div>
  );
}

interface SecondaryTileProps {
  label: string;
  value: string;
  testId?: string;
}

function SecondaryTile({ label, value, testId }: SecondaryTileProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      className="bg-dt-bg1 border border-dt-border rounded-dt p-3.5 flex flex-col gap-1"
    >
      <span className="text-xxs font-mono text-dt-text2 tracking-wide uppercase">{label}</span>
      <div className="text-lg font-bold text-dt-text0 font-mono leading-none">{value}</div>
    </div>
  );
}

export function InsightsPage(): JSX.Element {
  const { setCurrentMetrics } = useLayoutContext();
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [repo, setRepo] = useState("all");
  const { data, delta, loading, error } = useInsightsAggregate(timeRange, repo);
  const { data: activityData, loading: activityLoading } = useInsightsActivity(timeRange, repo);

  useEffect(() => {
    setCurrentMetrics(null);
  }, [setCurrentMetrics]);

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 pb-14">
      <div className="max-w-screen-xl mx-auto flex flex-col gap-5">
        {/* Scope bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="flex-1 text-xl font-bold text-dt-text0 font-sans m-0">
            Insights
          </h1>
          <SegPill
            options={REPO_OPTIONS}
            value={repo}
            onChange={setRepo}
            testId="repo-pill"
          />
          <SegPill
            options={TIME_RANGE_OPTIONS}
            value={timeRange}
            onChange={(v) => setTimeRange(v as TimeRange)}
            testId="time-range-pill"
          />
        </div>

        {/* Error banner */}
        {error && (
          <div
            data-testid="insights-error"
            role="alert"
            className="bg-dt-bg1 border border-dt-red/40 rounded-dt p-4 text-dt-red font-mono text-sm"
          >
            Failed to load insights: {error}
          </div>
        )}

        {/* Headline tiles: Tokens In + Tokens Out */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loading ? (
            <>
              <div
                data-testid="tile-skeleton"
                className="bg-dt-bg1 border border-dt-border rounded-dt p-5 h-28 animate-pulse"
              />
              <div className="bg-dt-bg1 border border-dt-border rounded-dt p-5 h-28 animate-pulse" />
            </>
          ) : data ? (
            <>
              <HeadlineTile
                label="Tokens In"
                value={formatTokens(data.tokensIn)}
                delta={delta?.tokensIn ?? null}
                deltaTestId="delta-tokensIn"
                testId="tile-tokensIn"
                sparklineData={data.daily.map((d) => d.tokensIn)}
                sparklineColor="teal"
              />
              <HeadlineTile
                label="Tokens Out"
                value={formatTokens(data.tokensOut)}
                delta={delta?.tokensOut ?? null}
                deltaTestId="delta-tokensOut"
                testId="tile-tokensOut"
                sparklineData={data.daily.map((d) => d.tokensOut)}
                sparklineColor="purple"
              />
            </>
          ) : null}
        </div>

        {/* Stat tiles: Cost, Sessions, Turns */}
        {loading && !error ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([0, 1, 2] as const).map((i) => (
              <div
                key={i}
                className="bg-dt-bg1 border border-dt-border rounded-dt p-4 h-20 animate-pulse"
              />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile
              label="Cost"
              value={formatCost(data.cost)}
              delta={delta?.cost ?? null}
              deltaTestId="delta-cost"
              testId="tile-cost"
            />
            <StatTile
              label="Sessions"
              value={String(data.sessions)}
              testId="tile-sessions"
            />
            <StatTile
              label="Turns"
              value={String(data.turns)}
              testId="tile-turns"
            />
          </div>
        ) : null}

        {/* Secondary tiles */}
        {loading && !error ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([0, 1, 2, 3] as const).map((i) => (
              <div
                key={i}
                className="bg-dt-bg1 border border-dt-border rounded-dt p-3.5 h-16 animate-pulse"
              />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SecondaryTile
              label="Avg cost/turn"
              value={formatCost(data.avgCostPerTurn)}
              testId="tile-avgCostPerTurn"
            />
            <SecondaryTile
              label="Avg tokens/turn"
              value={formatTokens(data.avgTokensPerTurn)}
              testId="tile-avgTokensPerTurn"
            />
            <SecondaryTile
              label="Active days"
              value={String(data.activeDays)}
              testId="tile-activeDays"
            />
            <SecondaryTile
              label="Peak hour"
              value={formatHour(data.peakHour)}
              testId="tile-peakHour"
            />
          </div>
        ) : null}

        {/* Token Usage Trend chart */}
        {data && (
          <div
            data-testid="section-trend-chart"
            className="bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-md font-semibold text-dt-text2 font-mono tracking-wide">
                Token Usage Trend
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-sm bg-dt-teal opacity-60" />
                  <span className="text-xxs font-mono text-dt-text2">Tokens In</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-sm bg-dt-purple opacity-60" />
                  <span className="text-xxs font-mono text-dt-text2">Tokens Out</span>
                </div>
              </div>
            </div>
            <TrendChart daily={data.daily} />
          </div>
        )}

        {/* When you work — single card, heatmap + hourly side by side */}
        <section data-testid="section-activity" className="dt-card p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-dt-text0">When you work</h2>
            <span className="text-xxs text-dt-text2">Last 7 days · by hour &amp; day</span>
          </div>
          {activityLoading || !activityData ? (
            <div className="h-36 bg-dt-bg2 rounded animate-pulse" />
          ) : (
            <div className="grid grid-cols-2 gap-6 items-start">
              <div className="flex flex-col gap-2">
                <span className="text-xxs text-dt-text2 uppercase tracking-wide">Weekday × Hour</span>
                <HeatmapGrid heatmap={activityData.heatmap} />
              </div>
              <HourlyBars hourly={activityData.hourly} />
            </div>
          )}
        </section>

        {/* Placeholder sections for future milestones */}
        {PLACEHOLDER_SECTIONS.map((title) => (
          <PlaceholderCard
            key={title}
            title={title}
            testId={`section-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
          />
        ))}
      </div>
    </div>
  );
}
