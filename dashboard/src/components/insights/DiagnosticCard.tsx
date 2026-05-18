import { ChevronRight } from "lucide-react";
import type { DiagnosticCategory, DiagnosticResult } from "../../lib/insightsDiagnosticsTypes";
import { DiagnosticAnalysis } from "./DiagnosticAnalysis";

interface DiagnosticCardProps {
  diagnostic: DiagnosticResult;
  variant: "primary" | "secondary";
  selected: boolean;
  evidenceOpen?: boolean;
  onSelect: () => void;
  onToggleEvidence?: () => void;
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

function scanSignal(diagnostic: DiagnosticResult): string {
  return diagnostic.evidenceChips[0] ?? diagnostic.summary;
}

function impactTone(category: DiagnosticCategory): string {
  if (category === "quality") return "border-dt-red/30 bg-dt-red-dim text-dt-red";
  if (category === "cost") return "border-dt-yellow/30 bg-dt-yellow-dim text-dt-yellow";
  if (category === "latency") return "border-dt-teal/30 bg-dt-teal-dim text-dt-teal";
  if (category === "context") return "border-dt-sky/30 bg-dt-sky-dim text-dt-sky";
  if (category === "workflow") return "border-dt-purple/30 bg-dt-purple-dim text-dt-purple";
  return "border-dt-accent/30 bg-dt-accent-dim text-dt-accent";
}

function rowImpact(diagnostic: DiagnosticResult): { label: string; value: string } {
  switch (diagnostic.sourcePattern) {
    case "long_turn_durations": {
      const overMinute = diagnostic.impactValue.match(/\(([^)]+)\)/)?.[1];
      return {
        label: "Slow turns",
        value: overMinute?.replace("over 1m", ">1m") ?? diagnostic.impactValue,
      };
    }
    case "high_context_duration_tax": {
      const ratio = diagnostic.impactValue.match(/(\d+(?:\.\d+)?x slower)/)?.[1];
      return { label: "Context tax", value: ratio ?? diagnostic.impactValue };
    }
    case "cache_hit_ratio": {
      const cacheReuse = diagnostic.impactValue.match(/(\d+(?:\.\d+)?%)/)?.[1];
      return { label: "Cache reuse", value: cacheReuse ?? diagnostic.impactValue };
    }
    case "edit_rejection_rate": {
      const rejection = diagnostic.impactValue.match(/(\d+)\s+of\s+(\d+).*rejected/i);
      return {
        label: "Edit acceptance",
        value: rejection ? `${rejection[1]} / ${rejection[2]} rejected` : diagnostic.impactValue,
      };
    }
    case "tool_failure_storm":
      return { label: "Failed tools", value: diagnostic.impactValue };
    case "cost_per_loc_outlier":
      return { label: "Cost / LOC", value: diagnostic.impactValue };
    default:
      return { label: diagnostic.impactLabel, value: diagnostic.impactValue };
  }
}

export function DiagnosticCard({
  diagnostic,
  variant,
  selected,
  evidenceOpen = false,
  onSelect,
  onToggleEvidence,
}: DiagnosticCardProps): JSX.Element {
  const dotCount = confidenceDotCount(diagnostic.confidence);
  const impact = rowImpact(diagnostic);
  const baseClasses = [
    "overflow-hidden rounded-dt border border-l-4 bg-dt-bg1 text-left shadow-dt-sm transition-colors",
    CATEGORY_CLASSES[diagnostic.category],
    selected ? "border-dt-border-active bg-dt-bg1" : "border-dt-border hover:border-dt-border-active hover:bg-dt-bg2",
  ].join(" ");

  return (
    <article
      data-testid={variant === "primary" ? "diagnostic-card-primary" : "diagnostic-card-secondary"}
      className={baseClasses}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-expanded={selected}
        aria-label={`${diagnostic.title}. ${selected ? "Hide details" : "View details"}`}
        onClick={onSelect}
        className="grid w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors md:grid-cols-[2rem_8rem_minmax(0,1fr)_8.5rem] md:items-center"
      >
        <span className="font-mono text-md font-bold tabular-nums text-dt-text2 lg:text-center">
          {diagnostic.rank}
        </span>
        <span
          className={[
            "w-fit rounded-full px-2 py-0.75 text-center font-mono text-md font-bold uppercase tracking-wide lg:w-full",
            CHIP_CLASSES[diagnostic.category],
          ].join(" ")}
        >
          {diagnostic.category}
        </span>
        <span className="min-w-0 py-0.5">
          <span className="block truncate text-xl font-bold leading-6 tracking-[-0.01em] text-dt-text0">
            {diagnostic.title}
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-lg leading-5 text-dt-text2">
              {scanSignal(diagnostic)}
            </span>
            <span
              className={[
                "inline-flex max-w-full shrink-0 items-baseline gap-1.5 rounded-full border px-2 py-0.75 font-mono text-md",
                impactTone(diagnostic.category),
              ].join(" ")}
            >
              <span className="font-bold uppercase tracking-wide">{impact.label}</span>
              <span className="truncate font-bold tabular-nums text-dt-text0">
                {impact.value}
              </span>
            </span>
          </span>
        </span>
        <span
          className={[
            "inline-flex h-9 w-fit shrink-0 items-center gap-1 rounded-dt-sm border px-2.5 font-sans text-md font-semibold transition-colors md:w-full md:justify-center",
            selected
              ? "border-dt-accent bg-dt-accent-dim text-dt-accent"
              : "border-dt-border bg-dt-bg2 text-dt-text1",
          ].join(" ")}
        >
          {selected ? "Hide details" : "View details"}
          <ChevronRight
            size={14}
            className={selected ? "rotate-90 text-dt-accent transition-transform" : "text-dt-text2 transition-transform"}
          />
        </span>
      </button>

      {selected ? (
        <div className="border-t border-dashed border-dt-border px-4 pb-4 pt-3 lg:pl-14">
          <div className="grid gap-x-7 gap-y-3 lg:grid-cols-2">
            <section className="flex flex-col gap-1">
              <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                What happened
              </span>
              <p className="text-md leading-6 text-dt-text0">
                {diagnostic.tellMeMore.whatHappened}
              </p>
            </section>
            <section className="flex flex-col gap-1">
              <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                Why it matters
              </span>
              <p className="text-md leading-6 text-dt-text0">
                {diagnostic.tellMeMore.whyItMatters}
              </p>
            </section>
            <section className="rounded-dt-sm border border-dt-accent-dim bg-dt-accent-dim px-3 py-3 lg:col-span-2">
              <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-accent">
                Change this week
              </span>
              <p className="mt-1 text-md leading-6 text-dt-text0">{diagnostic.changeThisWeek}</p>
            </section>
            <section className="flex flex-col gap-1">
              <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                Expected outcome
              </span>
              <div className="grid gap-2">
                {diagnostic.tellMeMore.recommendedChanges.length > 0 ? (
                  diagnostic.tellMeMore.recommendedChanges.map((item) => (
                    <p key={`${item.priority}-${item.change}`} className="text-md leading-6 text-dt-text0">
                      {item.expectedEffect}
                    </p>
                  ))
                ) : (
                  <p className="text-md leading-6 text-dt-text0">{diagnostic.impactDetail}</p>
                )}
              </div>
            </section>
            <section className="flex flex-col gap-1">
              <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                Evidence strength
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-md text-dt-text1">
                  {evidenceLabel(diagnostic.confidence)}
                </span>
                <span className="inline-flex gap-0.75">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className={[
                        "h-1.5 w-1.5 rounded-full",
                        index < dotCount ? "bg-dt-green" : "bg-dt-text2",
                      ].join(" ")}
                    />
                  ))}
                </span>
              </div>
            </section>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={evidenceOpen}
              onClick={onToggleEvidence}
              className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-dt-sm border border-dt-border bg-dt-bg2 px-2.5 py-1 font-sans text-md font-semibold text-dt-text1 transition-colors hover:border-dt-border-active hover:bg-dt-bg3 hover:text-dt-text0"
            >
              {evidenceOpen ? "Hide evidence" : "Show evidence"}
              <ChevronRight
                size={14}
                className={evidenceOpen ? "rotate-90 text-dt-accent transition-transform" : "text-dt-text2 transition-transform"}
              />
            </button>
          </div>

          {evidenceOpen ? (
            <div data-testid="diagnostic-evidence-anchor" className="mt-4">
              <DiagnosticAnalysis diagnostic={diagnostic} />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
