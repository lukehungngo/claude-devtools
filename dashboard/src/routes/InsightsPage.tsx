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
      <span data-testid={testId} className="text-dt-text2 text-xs font-mono">
        —
      </span>
    );
  }
  const pct = (Math.abs(value) * 100).toFixed(1);
  const isFlat = Math.abs(value) < 0.005;
  if (isFlat) {
    return (
      <span
        data-testid={testId}
        className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded-dt-xs text-dt-text2 bg-dt-bg2"
      >
        → {pct}%
      </span>
    );
  }
  const isUp = value > 0;
  return (
    <span
      data-testid={testId}
      className={[
        "text-xs font-mono font-semibold px-1.5 py-0.5 rounded-dt-xs",
        isUp
          ? "text-dt-red bg-dt-red/10"
          : "text-dt-green bg-dt-green/10",
      ].join(" ")}
    >
      {isUp ? "▲" : "▼"} {isUp ? "+" : "-"}{pct}%
    </span>
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
  return (
    <div
      data-testid={testId}
      className="bg-dt-bg1 border border-dt-border rounded-dt relative overflow-hidden"
      style={{ padding: "16px 18px" }}
    >
      <span className="text-xs font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
        {label}
      </span>
      <div
        className="font-mono font-medium text-dt-text0 leading-none mt-1"
        style={{ fontSize: "32px", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="mt-2">
        <DeltaChip value={delta} testId={deltaTestId} />
      </div>
      {sparklineData && sparklineData.length > 1 && (
        <div className="absolute bottom-3 right-2.5 opacity-80">
          <Sparkline
            data={sparklineData}
            color={sparklineColor}
            showArea
            width={72}
            height={36}
          />
        </div>
      )}
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
      className="bg-dt-bg1 border border-dt-border rounded-dt"
      style={{ padding: "14px 16px" }}
    >
      <span className="text-xs font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
        {label}
      </span>
      <div
        className="font-mono font-medium text-dt-text0 leading-none mt-1"
        style={{ fontSize: "26px", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      {delta !== undefined && (
        <div className="mt-2">
          <DeltaChip value={delta ?? null} testId={deltaTestId} />
        </div>
      )}
    </div>
  );
}

interface SecondaryTileProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaTestId?: string;
  testId?: string;
}

function SecondaryTile({ label, value, delta, deltaTestId, testId }: SecondaryTileProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      className="bg-dt-bg1 border border-dt-border rounded-dt"
      style={{ padding: "14px 16px" }}
    >
      <span className="text-xs font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
        {label}
      </span>
      <div
        className="font-mono font-medium text-dt-text0 leading-none mt-1"
        style={{ fontSize: "26px", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      {delta !== undefined && (
        <div className="mt-2">
          <DeltaChip value={delta ?? null} testId={deltaTestId} />
        </div>
      )}
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-dt-text0 font-sans m-0" style={{ letterSpacing: "-0.01em" }}>
              Insights
            </h1>
            <span className="text-md text-dt-text2 font-sans">
              Aggregate usage across your repos and sessions
            </span>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap pt-1">
            <SegPill options={REPO_OPTIONS} value={repo} onChange={setRepo} testId="repo-pill" />
            <SegPill
              options={TIME_RANGE_OPTIONS}
              value={timeRange}
              onChange={(v) => setTimeRange(v as TimeRange)}
              testId="time-range-pill"
            />
          </div>
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

        {/* Headline + Stat tiles: 5-col grid */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {([0, 1, 2, 3, 4] as const).map((i) => (
              <div
                key={i}
                data-testid={i === 0 ? "tile-skeleton" : undefined}
                className="bg-dt-bg1 border border-dt-border rounded-dt animate-pulse"
                style={{ height: 88 }}
              />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
            <StatTile
              label="Total Cost"
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

        {/* Secondary tiles: 4-col grid */}
        {data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SecondaryTile
              label="Avg Cost / Turn"
              value={formatCost(data.avgCostPerTurn)}
              testId="tile-avgCostPerTurn"
            />
            <SecondaryTile
              label="Avg Tokens / Turn"
              value={formatTokens(data.avgTokensPerTurn)}
              testId="tile-avgTokensPerTurn"
            />
            <SecondaryTile
              label="Active Days"
              value={String(data.activeDays)}
              testId="tile-activeDays"
            />
            <SecondaryTile
              label="Peak Hour"
              value={formatHour(data.peakHour)}
              testId="tile-peakHour"
            />
          </div>
        ) : null}

        {/* Token trend card */}
        {data && (
          <div
            data-testid="section-trend-chart"
            className="bg-dt-bg1 border border-dt-border rounded-dt"
            style={{ padding: "18px 20px 16px" }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-semibold text-dt-text0" style={{ letterSpacing: "-0.01em" }}>
                Token trend
              </span>
              <div className="flex items-center gap-3 ml-auto">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-full bg-dt-teal"
                    style={{ width: 8, height: 8 }}
                  />
                  <span className="text-xs font-mono text-dt-text2">Tokens in</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-full bg-dt-purple"
                    style={{ width: 8, height: 8 }}
                  />
                  <span className="text-xs font-mono text-dt-text2">Tokens out</span>
                </span>
              </div>
              <span className="text-xs font-mono text-dt-text2 ml-3">Hourly · last 7 days</span>
            </div>
            <div className="mt-3">
              <TrendChart daily={data.daily} />
            </div>
          </div>
        )}

        {/* When you work — heatmap + hourly with divider */}
        <section data-testid="section-activity" className="bg-dt-bg1 border border-dt-border rounded-dt overflow-hidden">
          <div
            className="flex items-center justify-between"
            style={{ padding: "14px 20px 0" }}
          >
            <h2 className="text-lg font-semibold text-dt-text0">When you work</h2>
            <span className="text-xs font-mono text-dt-text2">Last 7 days · by hour &amp; day</span>
          </div>
          {activityLoading || !activityData ? (
            <div className="m-5 h-36 bg-dt-bg2 rounded animate-pulse" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>
              <div style={{ padding: "14px 20px 16px" }}>
                <span className="text-xs font-mono font-bold uppercase tracking-[0.8px] text-dt-text2 block mb-3.5">
                  Weekday × Hour
                </span>
                <HeatmapGrid heatmap={activityData.heatmap} />
              </div>
              <div className="bg-dt-border" />
              <div style={{ padding: "14px 20px 16px" }}>
                <span className="text-xs font-mono font-bold uppercase tracking-[0.8px] text-dt-text2 block mb-3.5">
                  Hour of Day · Avg Tokens, All Time
                </span>
                <HourlyBars hourly={activityData.hourly} />
              </div>
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
