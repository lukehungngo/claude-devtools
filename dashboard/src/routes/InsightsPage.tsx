import { useState, useEffect } from "react";
import { useLayoutContext } from "../contexts/LayoutContext";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "all";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

const SECTION_CARDS = [
  "Usage Overview",
  "Activity Heatmap",
  "Model Mix",
  "Top Consumers",
  "Commands",
  "Agents",
  "Skills",
  "Efficiency Hints",
];

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

export function InsightsPage(): JSX.Element {
  const { setCurrentMetrics } = useLayoutContext();
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

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
            options={TIME_RANGE_OPTIONS}
            value={timeRange}
            onChange={(v) => setTimeRange(v as TimeRange)}
            testId="time-range-pill"
          />
        </div>

        {/* Section placeholder cards */}
        {SECTION_CARDS.map((title) => (
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
