import {
  ChevronRight,
  Code2,
  Database,
  Gauge,
  ShieldX,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DiagnosticCategory, DiagnosticResult } from "../../lib/insightsDiagnosticsTypes";

interface DiagnosticCardProps {
  diagnostic: DiagnosticResult;
  variant: "primary" | "secondary";
  selected: boolean;
  onSelect: () => void;
}

const CATEGORY_CLASSES: Record<DiagnosticCategory, string> = {
  quality: "border-l-dt-red",
  cost: "border-l-dt-yellow",
  latency: "border-l-dt-teal",
  context: "border-l-dt-sky",
  workflow: "border-l-dt-purple",
  model: "border-l-dt-accent",
};

const CHIP_CLASSES: Record<DiagnosticCategory, string> = {
  quality: "bg-dt-red-dim text-dt-red",
  cost: "bg-dt-yellow-dim text-dt-yellow",
  latency: "bg-dt-teal-dim text-dt-teal",
  context: "bg-dt-sky-dim text-dt-sky",
  workflow: "bg-dt-purple-dim text-dt-purple",
  model: "bg-dt-accent-dim text-dt-accent",
};

const ICONS: Record<string, LucideIcon> = {
  edit_rejection_rate: ShieldX,
  tool_failure_storm: Wrench,
  cache_hit_ratio: Database,
  cost_per_loc_outlier: Code2,
  long_turn_durations: Timer,
  high_context_duration_tax: Gauge,
};

function getIcon(diagnostic: DiagnosticResult): LucideIcon {
  return ICONS[diagnostic.sourcePattern] ?? Gauge;
}

function severityLabel(diagnostic: DiagnosticResult): string {
  if (diagnostic.severity === "positive") return "Working well";
  if (diagnostic.severity === "high") return "High impact";
  if (diagnostic.severity === "medium") return "Medium impact";
  return "Low impact";
}

function evidenceLabel(confidence: DiagnosticResult["confidence"]): string {
  if (confidence === "high") return "Strong evidence";
  if (confidence === "medium") return "Enough evidence";
  return "Early signal";
}

function confidenceDotCount(confidence: DiagnosticResult["confidence"]): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

export function DiagnosticCard({
  diagnostic,
  variant,
  selected,
  onSelect,
}: DiagnosticCardProps): JSX.Element {
  const Icon = getIcon(diagnostic);
  const dotCount = confidenceDotCount(diagnostic.confidence);
  const baseClasses = [
    "w-full h-full text-left border border-l-4 rounded-dt bg-dt-bg1 transition-colors cursor-pointer",
    CATEGORY_CLASSES[diagnostic.category],
    selected ? "border-dt-border-active shadow-sm ring-2 ring-dt-accent-dim" : "border-dt-border hover:border-dt-border-active hover:bg-dt-bg2",
    variant === "primary" ? "p-5" : "p-4",
  ].join(" ");

  return (
    <button
      type="button"
      data-testid={variant === "primary" ? "diagnostic-card-primary" : "diagnostic-card-secondary"}
      aria-pressed={selected}
      aria-label={diagnostic.title}
      onClick={onSelect}
      className={baseClasses}
    >
      <div className="flex h-full flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className={["rounded-full px-2 py-0.5 font-mono text-md font-bold uppercase tracking-wide", CHIP_CLASSES[diagnostic.category]].join(" ")}>
            {diagnostic.category}
          </span>
          <span className="font-mono text-md text-dt-text2">{severityLabel(diagnostic)}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-md text-dt-text2">
            {evidenceLabel(diagnostic.confidence)}
            <span className="inline-flex gap-0.5">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    index < dotCount ? "bg-dt-green" : "bg-dt-text3",
                  ].join(" ")}
                />
              ))}
            </span>
          </span>
        </div>

        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-dt-sm bg-dt-bg2 text-dt-text1">
            <Icon size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-md font-semibold text-dt-text2">#{diagnostic.rank}</span>
              <span className={variant === "primary" ? "text-lg font-semibold leading-tight text-dt-text0" : "text-md font-semibold leading-tight text-dt-text0"}>
                {diagnostic.title}
              </span>
            </span>
          </span>
          <ChevronRight
            size={15}
            className={selected ? "mt-1 shrink-0 text-dt-accent" : "mt-1 shrink-0 text-dt-text2"}
          />
        </div>

        <p className={variant === "primary" ? "text-md leading-6 text-dt-text1" : "text-md leading-5 text-dt-text1"}>
          {diagnostic.summary}
        </p>

        <div className="flex flex-wrap items-baseline gap-2 py-1">
          <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
            {diagnostic.impactLabel}
          </span>
          <span className={variant === "primary" ? "font-mono text-3xl font-bold text-dt-text0" : "font-mono text-xl font-bold text-dt-text0"}>
            {diagnostic.impactValue}
          </span>
          <span className="font-mono text-md text-dt-text2">{diagnostic.impactDetail}</span>
        </div>

        <div className="border-l-2 border-dt-border-active py-1 pl-3 text-md leading-5 text-dt-text0">
          <span className="mb-1 block font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
            Change this week
          </span>
          {diagnostic.changeThisWeek}
        </div>

        {diagnostic.evidenceChips.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {diagnostic.evidenceChips.slice(0, variant === "primary" ? 4 : 3).map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-dt-border bg-dt-bg px-2 py-0.5 font-mono text-md text-dt-text2"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}
