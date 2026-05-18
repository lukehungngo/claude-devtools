import { CheckCircle2 } from "lucide-react";
import type { DiagnosticResult } from "../../lib/insightsDiagnosticsTypes";

interface DiagnosticAnalysisProps {
  diagnostic: DiagnosticResult;
}

export function DiagnosticAnalysis({ diagnostic }: DiagnosticAnalysisProps): JSX.Element {
  return (
    <section
      data-testid="diagnostic-analysis"
      className="overflow-hidden rounded-dt border border-dt-border bg-dt-bg1"
    >
      <div className="flex items-center gap-2.5 border-b border-dt-border bg-dt-bg2 px-5 py-3.5">
        <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
          Details for selected pattern
        </div>
        <h3 className="text-md font-semibold text-dt-text0">{diagnostic.title}</h3>
        <div className="ml-auto rounded-dt-sm bg-dt-bg1 px-2 py-1 font-mono text-md text-dt-text2">
          {diagnostic.impactDetail}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4 px-5 py-4">
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
          <div className="rounded-dt-sm border border-dt-green/30 bg-dt-green-dim px-3 py-3">
            <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-green">
              Recommended changes
            </div>
            <div className="mt-2 grid gap-2">
              {diagnostic.tellMeMore.recommendedChanges.map((item) => (
                <div key={`${item.priority}-${item.change}`} className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-dt-green" />
                  <div>
                    <div className="text-md text-dt-text0">{item.change}</div>
                    <div className="font-mono text-md text-dt-text2">{item.expectedEffect}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3 border-t border-dt-border bg-dt-bg px-5 py-4 lg:border-l lg:border-t-0">
          <div>
            <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
              Change this week
            </div>
            <p className="mt-1 text-md leading-6 text-dt-text0">{diagnostic.changeThisWeek}</p>
          </div>
          {diagnostic.whyFlagged.length > 0 ? (
            <div>
              <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                Why flagged
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {diagnostic.whyFlagged.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-dt-border bg-dt-bg1 px-2 py-0.5 font-mono text-md text-dt-text2"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
