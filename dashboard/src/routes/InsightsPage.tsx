import { useState, useEffect, useMemo, useCallback } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useInsightsAggregate } from "../hooks/useInsightsAggregate";
import { formatCost, formatTokens } from "../lib/cost";
import { Sparkline } from "../components/insights/Sparkline";
import { TrendChart } from "../components/insights/TrendChart";
import { useInsightsActivity } from "../hooks/useInsightsActivity.js";
import { HeatmapGrid } from "../components/insights/HeatmapGrid.js";
import { HourlyBars } from "../components/insights/HourlyBars.js";
import { useInsightsModelMix } from "../hooks/useInsightsModelMix";
import { useInsightsTopConsumers } from "../hooks/useInsightsTopConsumers";
import { useInsightsCommandsAgentsSkills } from "../hooks/useInsightsCommandsAgentsSkills";
import { CASRow, BADGE_PALETTE, abbreviateName } from "../components/insights/CASRow";
import { useEfficiencyDiagnostics } from "../hooks/useEfficiencyDiagnostics";
import { DiagnosticsSection } from "../components/insights/DiagnosticsSection";
import type { PeriodSummary } from "../lib/insightsDiagnosticsTypes";
import type { DeltaData } from "../hooks/useInsightsAggregate";
import { safeWriteInsightsLastClick } from "../hooks/useInsightsNudge";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "all";
type ReportSnapshotState = "idle" | "generating" | "saved" | "error";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
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
              "px-2.5 py-0.5 rounded-full font-mono text-md font-semibold transition-all",
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

interface DeltaChipProps {
  value: number | null;
  testId?: string;
}

function DeltaChip({ value, testId }: DeltaChipProps): JSX.Element {
  if (value === null) {
    return (
      <span data-testid={testId} className="text-dt-text2 text-md font-mono">
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
        className="text-md font-mono font-semibold px-1.5 py-0.5 rounded-dt-xs text-dt-text2 bg-dt-bg2"
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
        "text-md font-mono font-semibold px-1.5 py-0.5 rounded-dt-xs",
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
      <span className="text-md font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
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
      <span className="text-md font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
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
      <span className="text-md font-mono font-bold uppercase tracking-[0.6px] text-dt-text2">
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

function modelColor(model: string): string {
  if (model.includes("sonnet")) return "var(--acc)";
  if (model.includes("opus")) return "var(--cat-purple)";
  if (model.includes("haiku")) return "var(--teal)";
  return "var(--t3)";
}

function formatTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatPeriodLabel(range: string): string {
  if (range === "24h") return "Last 24 hours";
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  if (range === "90d") return "Last 90 days";
  return "Selected period";
}

function formatPeriodChipLabel(range: string): string {
  if (range === "24h") return "last 24 hours";
  if (range === "7d") return "last 7 days";
  if (range === "30d") return "last 30 days";
  if (range === "90d") return "last 90 days";
  return "selected period";
}

function formatWindowDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatWindowRange(range: string): string {
  const end = new Date();
  const days = range === "24h" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  if (days === null) return "All time";
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return `${formatPeriodLabel(range)} · ${formatWindowDate(start)} → ${formatWindowDate(end)}`;
}

function deltaText(value: number | null | undefined): { text: string; tone: "up" | "down" | "flat" } {
  if (value === null || value === undefined || Math.abs(value) < 0.005) {
    return { text: "→ unchanged", tone: "flat" };
  }
  const pct = `${value > 0 ? "+" : "-"}${(Math.abs(value) * 100).toFixed(0)}%`;
  return { text: `▲ ${pct} vs prev 7d`, tone: value > 0 ? "up" : "down" };
}

function formatKpiCost(value: number): { value: string; suffix: string } {
  const formatted = formatCost(value);
  const [whole, cents] = formatted.split(".");
  return { value: whole ?? formatted, suffix: cents ? `.${cents}` : "" };
}

function formatKpiTokens(value: number): { value: string; suffix: string } {
  if (value >= 1_000_000) return { value: (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 0).replace(/\.0$/, ""), suffix: "M" };
  if (value >= 1_000) return { value: (value / 1_000).toFixed(value >= 10_000 ? 1 : 0).replace(/\.0$/, ""), suffix: "K" };
  return { value: value.toLocaleString(), suffix: "" };
}

interface PeriodMetricCellProps {
  label: string;
  value: string;
  suffix?: string;
  delta?: { text: string; tone: "up" | "down" | "flat" };
  accent: "amber" | "orange" | "teal" | "purple";
}

function PeriodMetricCell({ label, value, suffix, delta, accent }: PeriodMetricCellProps): JSX.Element {
  const accentClasses = {
    amber: "border-l-dt-yellow text-dt-yellow",
    orange: "border-l-dt-accent text-dt-accent",
    teal: "border-l-dt-teal text-dt-teal",
    purple: "border-l-dt-purple text-dt-purple",
  }[accent];
  const deltaTone = delta?.tone === "up"
    ? "text-dt-red"
    : delta?.tone === "down"
      ? "text-dt-green"
      : "text-dt-text2";

  return (
    <div className={["min-w-0 border-l-4 bg-dt-bg1 px-5 py-4", accentClasses].join(" ")}>
      <div className="font-mono text-md font-bold uppercase tracking-[0.18em] text-dt-text2">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1 font-mono">
        <span className="text-display font-bold leading-none">{value}</span>
        {suffix ? <span className="text-xl font-bold text-dt-text2">{suffix}</span> : null}
      </div>
      {delta ? (
        <div className={["mt-2 font-mono text-md font-bold", deltaTone].join(" ")}>
          {delta.text}
        </div>
      ) : null}
    </div>
  );
}

interface PeriodSummaryRowProps {
  period: PeriodSummary | null;
  delta: DeltaData | null;
}

function PeriodSummaryRow({ period, delta }: PeriodSummaryRowProps): JSX.Element {
  const spend = period ? formatKpiCost(period.spend) : { value: "...", suffix: "" };
  const tokens = period ? formatKpiTokens(period.tokens) : { value: "...", suffix: "" };
  const sessions = period ? { value: period.sessions.toLocaleString(), suffix: "" } : { value: "...", suffix: "" };
  const turns = period ? { value: period.turns.toLocaleString(), suffix: "" } : { value: "...", suffix: "" };

  return (
    <section className="grid overflow-hidden rounded-dt border border-dt-border bg-dt-bg1 shadow-dt-sm lg:grid-cols-[1fr_1fr_1fr_1fr_1.05fr]">
      <PeriodMetricCell
        label="Spent"
        value={spend.value}
        suffix={spend.suffix}
        delta={deltaText(delta?.cost)}
        accent="amber"
      />
      <PeriodMetricCell
        label="Tokens"
        value={tokens.value}
        suffix={tokens.suffix}
        delta={deltaText(delta?.tokensIn)}
        accent="orange"
      />
      <PeriodMetricCell
        label="Sessions"
        value={sessions.value}
        delta={{ text: "→ unchanged", tone: "flat" }}
        accent="teal"
      />
      <PeriodMetricCell
        label="Turns"
        value={turns.value}
        delta={{ text: "→ unchanged", tone: "flat" }}
        accent="purple"
      />
      <div className="min-w-0 border-l border-dt-border bg-dt-bg2 px-5 py-4">
        <div className="font-mono text-md font-bold uppercase tracking-[0.18em] text-dt-text2">
          Window
        </div>
        <div className="mt-3 text-2xl font-bold text-dt-text0">
          {formatWindowRange(period?.range ?? "")}
        </div>
      </div>
    </section>
  );
}

export function InsightsPage(): JSX.Element {
  // Record this visit so the Titlebar nudge resets. Runs once on mount.
  useEffect(() => {
    safeWriteInsightsLastClick();
  }, []);

  const { setCurrentMetrics } = useLayoutContext();
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [repo, setRepo] = useState("all");
  const [refreshCount, setRefreshCount] = useState(0);
  const [reportSnapshotState, setReportSnapshotState] =
    useState<ReportSnapshotState>("idle");
  const [reportSnapshotMessage, setReportSnapshotMessage] = useState<string | null>(null);
  const { data, delta, loading, error } = useInsightsAggregate(timeRange, repo, refreshCount);
  const { data: activityData, loading: activityLoading } = useInsightsActivity(timeRange, repo, refreshCount);
  const { data: modelMixData, loading: modelMixLoading } = useInsightsModelMix(timeRange, repo, refreshCount);
  const { data: topConsumersData, loading: topConsumersLoading } = useInsightsTopConsumers(timeRange, repo, refreshCount);
  // Load all repos independently (unfiltered, all-time) so the dropdown always shows every scanned repo
  const { data: allReposData } = useInsightsTopConsumers("all", "all", refreshCount);
  const repoOptions = useMemo(() => {
    const base = [{ value: "all", label: "All repos" }];
    const repos = allReposData?.repos ?? [];
    if (!repos.length) return base;
    return [
      ...base,
      ...repos.map((r) => ({ value: r.cwd, label: r.repo })),
    ];
  }, [allReposData?.repos]);
  const { data: casData, loading: casLoading } =
    useInsightsCommandsAgentsSkills(timeRange, repo, refreshCount);
  const diagnosticsRange = timeRange === "all" ? "90d" : timeRange;
  const {
    data: diagnosticsData,
    loading: diagnosticsLoading,
    error: diagnosticsError,
  } = useEfficiencyDiagnostics(diagnosticsRange, repo, refreshCount);
  const anyLoading =
    loading ||
    activityLoading ||
    modelMixLoading ||
    topConsumersLoading ||
    casLoading ||
    diagnosticsLoading;
  const periodSummary: PeriodSummary | null =
    diagnosticsData?.period ??
    (data
      ? {
          range: diagnosticsRange,
          spend: data.cost,
          tokens: data.tokensIn + data.tokensOut + data.cacheReadTokens,
          sessions: data.sessions,
          turns: data.turns,
        }
      : null);

  const regenerateReportSnapshot = useCallback(async () => {
    if (reportSnapshotState === "generating") return;

    setRefreshCount((c) => c + 1);
    setReportSnapshotState("generating");
    setReportSnapshotMessage("Creating snapshot...");

    try {
      const res = await fetch("/api/efficiency/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: diagnosticsRange, repo, force: true }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Report generation failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reportId: string | null = null;
      let streamComplete = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") {
            streamComplete = true;
            break;
          }

          try {
            const parsed = JSON.parse(payload) as {
              done?: boolean;
              error?: string;
              reportId?: string | null;
            };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.reportId) reportId = parsed.reportId;
            if (parsed.done) {
              streamComplete = true;
              break;
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }

        if (streamComplete) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }

      setReportSnapshotState("saved");
      setReportSnapshotMessage(reportId ? "Snapshot saved" : "Report generated");
    } catch {
      setReportSnapshotState("error");
      setReportSnapshotMessage("Snapshot failed");
    }
  }, [diagnosticsRange, repo, reportSnapshotState]);

  useEffect(() => {
    setCurrentMetrics(null);
  }, [setCurrentMetrics]);

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 pb-14">
      <div className="max-w-screen-xl mx-auto flex flex-col gap-5">
        {/* Scope bar */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 font-sans text-2xl font-bold text-dt-text0">
              Insights
            </h1>
            <span className="text-md text-dt-text2 font-sans">
              A weekly coach for your Claude Code workflow
            </span>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <button
              type="button"
              data-testid="insights-regenerate-report-btn"
              onClick={regenerateReportSnapshot}
              disabled={anyLoading || reportSnapshotState === "generating"}
              className="inline-flex h-8 items-center gap-2 rounded-dt border border-dt-border bg-dt-bg1 px-3 font-mono text-md font-bold text-dt-text1 shadow-dt-sm transition-colors hover:border-dt-accent hover:text-dt-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={reportSnapshotState === "generating" ? "animate-spin" : ""}
              />
              {reportSnapshotState === "generating" ? "Generating..." : "Regenerate report"}
            </button>
            {reportSnapshotMessage ? (
              <span
                className={[
                  "font-mono text-md font-semibold",
                  reportSnapshotState === "error" ? "text-dt-red" : "text-dt-text2",
                ].join(" ")}
              >
                {reportSnapshotMessage}
              </span>
            ) : null}
          </div>
        </div>

        <PeriodSummaryRow period={periodSummary} delta={delta} />

        <DiagnosticsSection
          diagnostics={diagnosticsData?.diagnostics ?? []}
          quickWins={diagnosticsData?.quickWins ?? []}
          loading={diagnosticsLoading}
          error={diagnosticsError}
          periodLabel={formatPeriodLabel(diagnosticsRange)}
        />

        <section data-testid="section-evidence" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                Evidence
              </span>
              <h2 className="text-xl font-semibold text-dt-text0">Underlying telemetry</h2>
              <span className="text-md text-dt-text2">
                Supports the patterns above.
              </span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap pt-1">
            <div className="relative inline-flex items-center">
              <select
                data-testid="repo-pill"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="appearance-none h-7 pl-2.5 pr-7 rounded font-mono text-md font-semibold bg-dt-bg2 border border-dt-border text-dt-text1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-dt-accent"
              >
                {repoOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 pointer-events-none text-dt-text2" />
            </div>
            <SegPill
              options={TIME_RANGE_OPTIONS}
              value={timeRange}
              onChange={(v) => setTimeRange(v as TimeRange)}
              testId="time-range-pill"
            />
            <button
              data-testid="insights-reload-btn"
              onClick={() => setRefreshCount((c) => c + 1)}
              disabled={anyLoading}
              title="Reload insights"
              aria-label="Reload insights"
              className="flex items-center justify-center text-dt-text3 hover:text-dt-text1 disabled:opacity-40 bg-transparent border-none cursor-pointer p-1 rounded"
            >
              <RefreshCw size={13} className={anyLoading ? "animate-spin" : ""} />
            </button>
          </div>
          </div>

        {/* Error banner */}
        {error && (
          <div
            data-testid="insights-error"
            role="alert"
            className="bg-dt-bg1 border border-dt-red/40 rounded-dt p-4 text-dt-red font-mono text-md"
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
          <div data-testid="stats-grid" className={`grid grid-cols-2 gap-3 ${data.cacheReadTokens > 0 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
            <HeadlineTile
              label="Tokens In"
              value={formatTokens(data.tokensIn)}
              delta={delta?.tokensIn ?? null}
              deltaTestId="delta-tokensIn"
              testId="tile-tokensIn"
              sparklineData={data.daily.map((d) => d.tokensIn)}
              sparklineColor="teal"
            />
            {data.cacheReadTokens > 0 && (
              <HeadlineTile
                label="Cached"
                value={formatTokens(data.cacheReadTokens)}
                delta={null}
                testId="insights-cached-tokens"
              />
            )}
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
                  <span className="text-md font-mono text-dt-text2">Tokens in</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-full bg-dt-purple"
                    style={{ width: 8, height: 8 }}
                  />
                  <span className="text-md font-mono text-dt-text2">Tokens out</span>
                </span>
              </div>
              <span className="text-md font-mono text-dt-text2 ml-3">Hourly · last 7 days</span>
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
            <span className="text-md font-mono text-dt-text2">Last 7 days · by hour &amp; day</span>
          </div>
          {activityLoading || !activityData ? (
            <div className="m-5 h-36 bg-dt-bg2 rounded animate-pulse" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>
              <div style={{ padding: "14px 20px 16px" }}>
                <span className="text-md font-mono font-bold uppercase tracking-[0.8px] text-dt-text2 block mb-3.5">
                  Weekday × Hour
                </span>
                <HeatmapGrid heatmap={activityData.heatmap} />
              </div>
              <div className="bg-dt-border" />
              <div style={{ padding: "14px 20px 16px" }}>
                <span className="text-md font-mono font-bold uppercase tracking-[0.8px] text-dt-text2 block mb-3.5">
                  Hour of Day · Avg Tokens, All Time
                </span>
                <HourlyBars hourly={activityData.hourly} />
              </div>
            </div>
          )}
        </section>

        {/* Model Mix section */}
        <div
          data-testid="section-model-mix"
          className="bg-dt-bg1 border border-dt-border rounded-dt"
          style={{ padding: "18px 20px 16px" }}
        >
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="text-lg font-semibold text-dt-text0" style={{ letterSpacing: "-0.01em" }}>
              Model mix
            </span>
            {modelMixData && (
              <span className="text-md font-mono text-dt-text2 ml-auto">
                Share of total tokens · {formatTokens(modelMixData.totalTokens)}
              </span>
            )}
          </div>

          {modelMixLoading || !modelMixData ? (
            <div className="h-7 rounded-full bg-dt-bg2 animate-pulse mb-4" />
          ) : (
            <>
              {/* Stacked proportion bar */}
              <div
                className="flex overflow-hidden mb-4"
                style={{ height: 28, borderRadius: 999, boxShadow: "var(--shadow-xs)" }}
              >
                {modelMixData.models.map((m) => (
                  <div
                    key={m.model}
                    title={`${m.model} · ${(m.share * 100).toFixed(0)}%`}
                    style={{
                      flex: m.share,
                      background: modelColor(m.model),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      minWidth: 0,
                    }}
                  >
                    {m.share > 0.08 && (
                      <span
                        className="font-mono font-semibold text-white"
                        style={{ fontSize: 12, padding: "0 8px", overflow: "hidden" }}
                      >
                        {m.model.replace("claude-", "")} · {(m.share * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Model rows */}
              <div className="flex flex-col gap-2">
                {modelMixData.models.map((m) => (
                  <div
                    key={m.model}
                    className="grid items-center bg-dt-bg0 border border-dt-border rounded-dt"
                    style={{ gridTemplateColumns: "180px 1fr 1fr 140px", padding: "14px 16px" }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="rounded flex-shrink-0"
                        style={{ width: 14, height: 14, background: modelColor(m.model) }}
                      />
                      <div>
                        <div className="text-lg font-semibold text-dt-text0">{m.model}</div>
                        <div className="text-md font-mono text-dt-text2 mt-0.5">
                          {(m.share * 100).toFixed(0)}% of total · {m.turns} turns
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3">
                      <div
                        className="text-md font-mono font-bold uppercase flex items-center gap-1"
                        style={{ letterSpacing: "0.5px", color: "var(--teal)" }}
                      >
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 6, height: 6, background: "var(--teal)" }}
                        />
                        TOKENS IN
                      </div>
                      <div
                        className="font-mono font-medium text-dt-text0"
                        style={{ fontSize: 24, letterSpacing: "-0.02em", lineHeight: 1 }}
                      >
                        {formatTokens(m.tokensIn)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3">
                      <div
                        className="text-md font-mono font-bold uppercase flex items-center gap-1"
                        style={{ letterSpacing: "0.5px", color: "var(--cat-purple)" }}
                      >
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 6, height: 6, background: "var(--cat-purple)" }}
                        />
                        TOKENS OUT
                      </div>
                      <div
                        className="font-mono font-medium text-dt-text0"
                        style={{ fontSize: 24, letterSpacing: "-0.02em", lineHeight: 1 }}
                      >
                        {formatTokens(m.tokensOut)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold text-dt-text0">{formatCost(m.cost)}</div>
                      <div className="text-md font-mono text-dt-text2 mt-0.5">total spend</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top Consumers section */}
        <div data-testid="section-top-consumers" className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Top repos card */}
          <div className="bg-dt-bg1 border border-dt-border rounded-dt" style={{ padding: "16px 18px" }}>
            <div className="text-lg font-semibold text-dt-text0 mb-3">
              Top repos{" "}
              <span className="text-md font-mono text-dt-text2 font-normal">by token spend</span>
            </div>
            {topConsumersLoading ? (
              <div className="flex flex-col gap-2">
                {([0, 1, 2] as const).map((i) => (
                  <div key={i} className="h-8 bg-dt-bg2 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {(topConsumersData?.repos ?? []).map((item, idx) => (
                  <div
                    key={idx}
                    className="grid items-center gap-2 px-2 py-1.5 rounded-dt-sm hover:bg-dt-bg2 transition-colors cursor-default"
                    style={{ gridTemplateColumns: "26px 1fr 80px" }}
                  >
                    <div
                      className="font-mono text-md font-bold text-dt-text2 flex items-center justify-center rounded-dt-sm bg-dt-bg2 border border-dt-border flex-shrink-0"
                      style={{ width: 22, height: 22 }}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-md font-semibold text-dt-text0 truncate">{item.repo}</div>
                      <div className="mt-1 rounded overflow-hidden" style={{ height: 3, background: "var(--bd)" }}>
                        <div className="h-full rounded" style={{ width: `${item.share * 100}%`, background: "var(--cat-purple)" }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-semibold text-dt-text0 leading-none">{formatTokens(item.totalTokens)}</div>
                      <span className="text-md font-mono text-dt-text2">tokens</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top sessions card */}
          <div className="bg-dt-bg1 border border-dt-border rounded-dt" style={{ padding: "16px 18px" }}>
            <div className="text-lg font-semibold text-dt-text0 mb-3">
              Top sessions{" "}
              <span className="text-md font-mono text-dt-text2 font-normal">by cost</span>
            </div>
            {topConsumersLoading ? (
              <div className="flex flex-col gap-2">
                {([0, 1, 2] as const).map((i) => (
                  <div key={i} className="h-8 bg-dt-bg2 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {(topConsumersData?.sessions ?? []).map((item, idx) => (
                  <div
                    key={idx}
                    className="grid items-center gap-2 px-2 py-1.5 rounded-dt-sm hover:bg-dt-bg2 transition-colors cursor-default"
                    style={{ gridTemplateColumns: "26px 1fr 80px" }}
                  >
                    <div
                      className="font-mono text-md font-bold text-dt-text2 flex items-center justify-center rounded-dt-sm bg-dt-bg2 border border-dt-border flex-shrink-0"
                      style={{ width: 22, height: 22 }}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-md font-semibold text-dt-text0 truncate">{`${item.repo} · ${item.date}`}</div>
                      <div className="mt-1 rounded overflow-hidden" style={{ height: 3, background: "var(--bd)" }}>
                        <div className="h-full rounded" style={{ width: `${item.share * 100}%`, background: "var(--acc)" }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-semibold text-dt-text0 leading-none">{formatCost(item.cost)}</div>
                      <span className="text-md font-mono text-dt-text2">spend</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top tool calls card */}
          <div className="bg-dt-bg1 border border-dt-border rounded-dt" style={{ padding: "16px 18px" }}>
            <div className="text-lg font-semibold text-dt-text0 mb-3">
              Top tool calls{" "}
              <span className="text-md font-mono text-dt-text2 font-normal">by count</span>
            </div>
            {topConsumersLoading ? (
              <div className="flex flex-col gap-2">
                {([0, 1, 2] as const).map((i) => (
                  <div key={i} className="h-8 bg-dt-bg2 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {(topConsumersData?.tools ?? []).map((item, idx) => (
                  <div
                    key={idx}
                    className="grid items-center gap-2 px-2 py-1.5 rounded-dt-sm hover:bg-dt-bg2 transition-colors cursor-default"
                    style={{ gridTemplateColumns: "26px 1fr 80px" }}
                  >
                    <div
                      className="font-mono text-md font-bold text-dt-text2 flex items-center justify-center rounded-dt-sm bg-dt-bg2 border border-dt-border flex-shrink-0"
                      style={{ width: 22, height: 22 }}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-md font-semibold text-dt-text0 truncate">{item.name}</div>
                      <div className="mt-1 rounded overflow-hidden" style={{ height: 3, background: "var(--bd)" }}>
                        <div className="h-full rounded" style={{ width: `${item.share * 100}%`, background: "var(--teal)" }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-semibold text-dt-text0 leading-none">{item.count.toLocaleString()}</div>
                      <span className="text-md font-mono text-dt-text2">calls</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Commands, Agents, Skills + Efficiency Hints coming soon */}
        <div className="flex flex-col gap-3">
          {/* Commands card */}
          <div className="bg-dt-bg1 border border-dt-border rounded-dt" style={{ padding: "16px 18px" }} data-testid="section-commands">
            <div className="text-lg font-semibold text-dt-text0 mb-3">
              Commands{" "}
              <span className="text-md font-mono text-dt-text2 font-normal">by invocations</span>
            </div>
            {casLoading ? (
              <div className="flex flex-col gap-2">
                {([0, 1, 2] as const).map((i) => (
                  <div key={i} className="h-8 bg-dt-bg2 rounded animate-pulse" />
                ))}
              </div>
            ) : (casData?.commands ?? []).length === 0 ? (
              <div className="text-md text-dt-text2 py-4 text-center">No slash commands found</div>
            ) : (
              <div className="flex gap-4">
                {/* Left panel: ranked list */}
                <div className="flex flex-col gap-1.5" style={{ width: "50%", flexShrink: 0 }}>
                  {(casData?.commands ?? []).map((item, idx) => (
                    <div
                      key={item.name}
                      className="flex items-start gap-2.5 px-2 py-2.5 rounded-dt-sm hover:bg-dt-bg2 transition-colors cursor-default"
                    >
                      <div
                        className="font-mono text-md font-bold text-dt-text1 flex items-center justify-center rounded flex-shrink-0 bg-dt-bg2 mt-0.5"
                        style={{ width: 32, height: 20 }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0 min-h-0">
                        {/* Line 1: name + count */}
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-md font-mono font-semibold text-dt-text0 truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-md font-mono font-semibold text-dt-text0">{item.count.toLocaleString()}</span>
                            <span className="text-md font-mono text-dt-text2 ml-1">calls</span>
                          </div>
                        </div>
                        {/* Line 2: progress bar + avg tokens | total tokens */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div
                              className="rounded overflow-hidden"
                              style={{ height: 3, background: "var(--bd)" }}
                              role="progressbar"
                              aria-valuenow={Math.round(item.share * 100)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${item.name} — ${Math.round(item.share * 100)}% share of invocations`}
                            >
                              <div
                                className="h-full rounded"
                                style={{ width: `${item.share * 100}%`, background: "var(--teal)" }}
                              />
                            </div>
                            <div className="mt-1 text-md font-mono text-dt-text2">
                              avg {formatTok(item.avgTokensIn)} in · {formatTok(item.avgTokensOut)} out
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 text-md font-mono text-dt-text2">
                            <div>{formatTok(item.tokensIn)} in</div>
                            <div>{formatTok(item.tokensOut)} out</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right panel: CASRow cards */}
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {(casData?.commands ?? []).map((item, idx) => (
                    <CASRow
                      key={item.name}
                      name={item.name}
                      daily={item.daily}
                      count={item.count}
                      trend={item.trend}
                      badgeIndex={idx}
                      sparklineColor="teal"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Agents card */}
          <div className="bg-dt-bg1 border border-dt-border rounded-dt" style={{ padding: "16px 18px" }} data-testid="section-agents">
            <div className="text-lg font-semibold text-dt-text0 mb-3">
              Agents{" "}
              <span className="text-md font-mono text-dt-text2 font-normal">by dispatches</span>
            </div>
            {casLoading ? (
              <div className="flex flex-col gap-2">
                {([0, 1, 2] as const).map((i) => (
                  <div key={i} className="h-8 bg-dt-bg2 rounded animate-pulse" />
                ))}
              </div>
            ) : (casData?.agents ?? []).length === 0 ? (
              <div className="text-md text-dt-text2 py-4 text-center">No agent dispatches found</div>
            ) : (
              <div className="flex gap-4">
                {/* Left panel: ranked list */}
                <div className="flex flex-col gap-1.5" style={{ width: "50%", flexShrink: 0 }}>
                  {(casData?.agents ?? []).map((item, idx) => {
                    const badgeColor = BADGE_PALETTE[idx % BADGE_PALETTE.length];
                    const abbrev = abbreviateName(item.type);
                    return (
                      <div
                        key={item.type}
                        className="flex items-start gap-2.5 px-2 py-2.5 rounded-dt-sm hover:bg-dt-bg2 transition-colors cursor-default"
                      >
                        <div
                          aria-hidden="true"
                          className="font-mono text-md font-bold uppercase tracking-wide text-white flex items-center justify-center rounded flex-shrink-0 mt-0.5"
                          style={{ width: 32, height: 22, background: badgeColor }}
                        >
                          {abbrev}
                        </div>
                        <div className="flex-1 min-w-0 min-h-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="text-md font-mono font-semibold text-dt-text0 truncate" title={item.type}>
                              {item.type}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-md font-mono font-semibold text-dt-text0">{item.count.toLocaleString()}</span>
                              <span className="text-md font-mono text-dt-text2 ml-1">runs</span>
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div
                                className="rounded overflow-hidden"
                                style={{ height: 3, background: "var(--bd)" }}
                                role="progressbar"
                                aria-valuenow={Math.round(item.share * 100)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${item.type} — ${Math.round(item.share * 100)}% share of dispatches`}
                              >
                                <div
                                  className="h-full rounded"
                                  style={{ width: `${item.share * 100}%`, background: badgeColor }}
                                />
                              </div>
                              <div className="mt-1 text-md font-mono text-dt-text2">
                                avg {formatTok(item.avgTokensIn)} in · {formatTok(item.avgTokensOut)} out
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 text-md font-mono text-dt-text2">
                              <div>{formatTok(item.tokensIn)} in</div>
                              <div>{formatTok(item.tokensOut)} out</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right panel: CASRow cards */}
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {(casData?.agents ?? []).map((item, idx) => (
                    <CASRow
                      key={item.type}
                      name={item.type}
                      daily={item.daily}
                      count={item.count}
                      trend={item.trend}
                      badgeIndex={idx}
                      sparklineColor="purple"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Skills card */}
          <div className="bg-dt-bg1 border border-dt-border rounded-dt" style={{ padding: "16px 18px" }} data-testid="section-skills">
            <div className="text-lg font-semibold text-dt-text0 mb-3">
              Skills{" "}
              <span className="text-md font-mono text-dt-text2 font-normal">by invocations</span>
            </div>
            {casLoading ? (
              <div className="flex flex-col gap-2">
                {([0, 1, 2] as const).map((i) => (
                  <div key={i} className="h-8 bg-dt-bg2 rounded animate-pulse" />
                ))}
              </div>
            ) : (casData?.skills ?? []).length === 0 ? (
              <div className="text-md text-dt-text2 py-4 text-center">No skill invocations found</div>
            ) : (
              <div className="flex gap-4">
                {/* Left panel: ranked list */}
                <div className="flex flex-col gap-1.5" style={{ width: "50%", flexShrink: 0 }}>
                  {(casData?.skills ?? []).map((item, idx) => (
                    <div
                      key={item.name}
                      className="flex items-start gap-2.5 px-2 py-2.5 rounded-dt-sm hover:bg-dt-bg2 transition-colors cursor-default"
                    >
                      <div
                        className="font-mono text-md font-bold text-dt-text1 flex items-center justify-center rounded flex-shrink-0 bg-dt-bg2 mt-0.5"
                        style={{ width: 32, height: 20 }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0 min-h-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-md font-mono font-semibold text-dt-text0 truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-md font-mono font-semibold text-dt-text0">{item.count.toLocaleString()}</span>
                            <span className="text-md font-mono text-dt-text2 ml-1">runs</span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div
                              className="rounded overflow-hidden"
                              style={{ height: 3, background: "var(--bd)" }}
                              role="progressbar"
                              aria-valuenow={Math.round(item.share * 100)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${item.name} — ${Math.round(item.share * 100)}% share of invocations`}
                            >
                              <div
                                className="h-full rounded"
                                style={{ width: `${item.share * 100}%`, background: "var(--teal)" }}
                              />
                            </div>
                            <div className="mt-1 text-md font-mono text-dt-text2">
                              avg {formatTok(item.avgTokensIn)} in · {formatTok(item.avgTokensOut)} out
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 text-md font-mono text-dt-text2">
                            <div>{formatTok(item.tokensIn)} in</div>
                            <div>{formatTok(item.tokensOut)} out</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right panel: CASRow cards */}
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {(casData?.skills ?? []).map((item, idx) => (
                    <CASRow
                      key={item.name}
                      name={item.name}
                      daily={item.daily}
                      count={item.count}
                      trend={item.trend}
                      badgeIndex={idx}
                      sparklineColor="teal"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        </section>
      </div>
    </div>
  );
}
