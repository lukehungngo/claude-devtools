import {
  CheckCircle2,
  ChevronDown,
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
      aria-expanded={selected}
      aria-label={`${diagnostic.title}. ${selected ? "Details expanded" : "Expand details"}`}
      onClick={onSelect}
      className={baseClasses}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-dt-sm bg-dt-bg2 text-dt-text1">
              <Icon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-1 flex flex-wrap items-center gap-2">
                <span className={["rounded-full px-2 py-0.5 font-mono text-md font-bold uppercase tracking-wide", CHIP_CLASSES[diagnostic.category]].join(" ")}>
                  {diagnostic.category}
                </span>
                <span className="font-mono text-md text-dt-text2">{severityLabel(diagnostic)}</span>
                {selected ? (
                  <span className="rounded-full bg-dt-accent-dim px-2 py-0.5 font-mono text-md font-bold text-dt-accent">
                    Selected
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-md font-semibold text-dt-text2">#{diagnostic.rank}</span>
                <span className={selected ? "text-lg font-semibold leading-tight text-dt-text0" : "text-md font-semibold leading-tight text-dt-text0"}>
                  {diagnostic.title}
                </span>
              </span>
              {!selected ? (
                <span className="mt-1 block text-md leading-5 text-dt-text1">
                  {diagnostic.summary}
                </span>
              ) : null}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2 lg:justify-end">
            <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
              {diagnostic.impactLabel}
            </span>
            <span className={selected ? "font-mono text-2xl font-bold text-dt-text0" : "font-mono text-lg font-bold text-dt-text0"}>
              {diagnostic.impactValue}
            </span>
            <span className="font-mono text-md text-dt-text2">{diagnostic.impactDetail}</span>
          </div>

          <span
            className={[
              "inline-flex shrink-0 items-center gap-1 font-mono text-md font-semibold lg:justify-end",
              selected ? "text-dt-accent" : "text-dt-text2",
            ].join(" ")}
          >
            {selected ? "Details open" : "View details"}
            <ChevronDown size={15} className={selected ? "rotate-180 transition-transform" : "transition-transform"} />
          </span>
        </div>

        {selected ? (
          <div className="grid gap-4 border-t border-dt-border pt-3 lg:grid-cols-[1.35fr_1fr]">
            <div className="flex flex-col gap-3">
              <p className="text-md leading-6 text-dt-text1">{diagnostic.summary}</p>
              <div>
                <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                  What happened
                </div>
                <p className="mt-1 text-md leading-6 text-dt-text1">
                  {diagnostic.tellMeMore.whatHappened}
                </p>
              </div>
              <div>
                <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                  Why it matters
                </div>
                <p className="mt-1 text-md leading-6 text-dt-text1">
                  {diagnostic.tellMeMore.whyItMatters}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="border-l-2 border-dt-border-active py-1 pl-3 text-md leading-5 text-dt-text0">
                <span className="mb-1 block font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                  Change this week
                </span>
                {diagnostic.changeThisWeek}
              </div>
              <div className="rounded-dt-sm border border-dt-green/30 bg-dt-green-dim px-3 py-3">
                <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-green">
                  Recommended changes
                </div>
                <div className="mt-2 grid gap-2">
                  {diagnostic.tellMeMore.recommendedChanges.map((item) => (
                    <span key={`${item.priority}-${item.change}`} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-dt-green" />
                      <span>
                        <span className="block text-md text-dt-text0">{item.change}</span>
                        <span className="block font-mono text-md text-dt-text2">
                          {item.expectedEffect}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {diagnostic.evidenceChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 lg:col-span-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-md text-dt-text2">
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
                {diagnostic.evidenceChips.slice(0, 5).map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-dt-border bg-dt-bg px-2 py-0.5 font-mono text-md text-dt-text2"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}

            <span className="inline-flex items-center gap-1 font-mono text-md font-semibold text-dt-accent lg:col-span-2">
              Jump to evidence below
              <ChevronRight size={15} />
            </span>
          </div>
        ) : diagnostic.evidenceChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {diagnostic.evidenceChips.slice(0, 3).map((chip) => (
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
