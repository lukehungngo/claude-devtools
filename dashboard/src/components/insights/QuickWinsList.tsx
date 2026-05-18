import {
  Code2,
  Database,
  Gauge,
  ShieldX,
  Timer,
  Wrench,
  ThumbsUp,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";
import type { QuickWinResult } from "../../lib/insightsDiagnosticsTypes";

interface QuickWinsListProps {
  quickWins: QuickWinResult[];
}

const ICONS: Record<string, LucideIcon> = {
  edit_rejection_rate: ShieldX,
  tool_failure_storm: Wrench,
  cache_hit_ratio: Database,
  cost_per_loc_outlier: Code2,
  long_turn_durations: Timer,
  high_context_duration_tax: Gauge,
  wrench: Wrench,
  database: Database,
  timer: Timer,
};

function getIcon(quickWin: QuickWinResult): LucideIcon {
  return ICONS[quickWin.pattern] ?? ICONS[quickWin.icon] ?? Gauge;
}

function statusLabel(status: QuickWinResult["status"]): string {
  return status === "praise" ? "Working well" : "Needs attention";
}

export function QuickWinsList({ quickWins }: QuickWinsListProps): JSX.Element {
  return (
    <section
      data-testid="section-quick-wins"
      className="bg-dt-bg1 border border-dt-border rounded-dt px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-dt-text0">Quick wins</h3>
          <div className="mt-0.5 text-md text-dt-text2">
            Rule-backed coaching hints from deterministic signals.
          </div>
        </div>
        <div className="font-mono text-md text-dt-text2">{quickWins.length} active</div>
      </div>

      {quickWins.length === 0 ? (
        <div className="mt-3 rounded-dt bg-dt-bg2 px-3 py-3 text-md text-dt-text2">
          No quick wins fired for this range.
        </div>
      ) : (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {quickWins.map((quickWin) => {
            const Icon = getIcon(quickWin);
            const StatusIcon = quickWin.status === "praise" ? ThumbsUp : ThumbsDown;
            return (
              <article
                key={quickWin.id}
                className="rounded-dt border border-dt-border bg-dt-bg2 px-3 py-3"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-dt-xs bg-dt-bg1 text-dt-text1">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-md font-semibold text-dt-text0">{quickWin.title}</h4>
                      <span
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-md",
                          quickWin.status === "praise"
                            ? "bg-dt-green-dim text-dt-green"
                            : "bg-dt-red-dim text-dt-red",
                        ].join(" ")}
                      >
                        <StatusIcon size={11} />
                        {statusLabel(quickWin.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-md text-dt-text1">{quickWin.punchline}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-dt-xs bg-dt-bg1 px-2 py-1 font-mono text-md font-semibold text-dt-text0">
                        {quickWin.impactValue}
                      </span>
                      <span className="font-mono text-md text-dt-text2">{quickWin.impactLabel}</span>
                    </div>
                    <p className="mt-2 text-md text-dt-text2">{quickWin.recommendation}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
