import type { QuickWinCategory, QuickWinResult } from "../../lib/insightsDiagnosticsTypes";

const CATEGORY_CLASSES: Record<QuickWinCategory, string> = {
  quality: "border-l-dt-red",
  cost: "border-l-dt-yellow",
  latency: "border-l-dt-teal",
};

const CHIP_CLASSES: Record<QuickWinCategory, string> = {
  quality: "bg-dt-red-dim text-dt-red",
  cost: "bg-dt-yellow-dim text-dt-yellow",
  latency: "bg-dt-teal-dim text-dt-teal",
};

const IMPACT_CLASSES: Record<QuickWinCategory, string> = {
  quality: "border-dt-red/30 bg-dt-red-dim text-dt-red",
  cost: "border-dt-yellow/30 bg-dt-yellow-dim text-dt-yellow",
  latency: "border-dt-teal/30 bg-dt-teal-dim text-dt-teal",
};

interface QuickWinsListProps {
  quickWins: QuickWinResult[];
}

function statusLabel(status: QuickWinResult["status"]): string {
  return status === "praise" ? "Working well" : "Needs attention";
}

export function QuickWinsList({ quickWins }: QuickWinsListProps): JSX.Element {
  return (
    <section
      data-testid="section-quick-wins"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold text-dt-text0">Quick wins</h3>
        <span className="text-md font-medium text-dt-text2">
          Small fixes you can apply immediately.
        </span>
        <span className="ml-auto font-mono text-md text-dt-text2">
          {quickWins.length} active
        </span>
      </div>

      {quickWins.length === 0 ? (
        <div className="rounded-dt border border-dt-border bg-dt-bg2 px-3 py-3 text-md text-dt-text2">
          No quick wins fired for this range.
        </div>
      ) : (
        <div className="grid gap-2">
          {quickWins.map((quickWin) => {
            return (
              <article
                key={quickWin.id}
                className={[
                  "rounded-dt border border-l-4 bg-dt-bg1 px-4 py-3 text-left shadow-dt-sm",
                  CATEGORY_CLASSES[quickWin.category],
                ].join(" ")}
              >
                <div className="grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)_12rem] md:items-center">
                  <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-stretch md:gap-1">
                    <span
                      className={[
                        "w-fit rounded-full px-2 py-0.75 text-center font-mono text-md font-bold uppercase tracking-wide md:w-full",
                        CHIP_CLASSES[quickWin.category],
                      ].join(" ")}
                    >
                      {quickWin.category.toUpperCase()}
                    </span>
                    <span className="font-mono text-md text-dt-text2 md:text-center">
                      {statusLabel(quickWin.status)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xl font-bold leading-6 tracking-[-0.01em] text-dt-text0">
                      {quickWin.title}
                    </h4>
                    <p className="mt-1 text-lg leading-5 text-dt-text2">{quickWin.punchline}</p>
                    <p className="mt-2 text-md leading-6 text-dt-text0">
                      <span className="font-mono font-bold uppercase tracking-wide text-dt-text2">
                        Change:
                      </span>{" "}
                      {quickWin.recommendation}
                    </p>
                  </div>
                  <span
                    className={[
                      "inline-flex max-w-full shrink-0 items-baseline gap-1.5 rounded-full border px-2 py-0.75 font-mono text-md md:justify-center",
                      IMPACT_CLASSES[quickWin.category],
                    ].join(" ")}
                  >
                    <span className="font-bold uppercase tracking-wide">{quickWin.impactLabel}</span>
                    <span className="truncate font-bold tabular-nums text-dt-text0">
                      {quickWin.impactValue}
                    </span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
