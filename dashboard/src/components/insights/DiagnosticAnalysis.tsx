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
          Evidence for selected pattern
        </div>
        <h3 className="text-md font-semibold text-dt-text0">{diagnostic.title}</h3>
        <div className="ml-auto rounded-dt-sm bg-dt-bg1 px-2 py-1 font-mono text-md text-dt-text2">
          {diagnostic.impactDetail}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr_1fr]">
        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
              Signal
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {diagnostic.evidenceChips.length > 0 ? (
                diagnostic.evidenceChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-dt-border bg-dt-bg px-2 py-0.5 font-mono text-md text-dt-text2"
                  >
                    {chip}
                  </span>
                ))
              ) : (
                <span className="font-mono text-md text-dt-text2">No compact evidence chips available.</span>
              )}
            </div>
          </div>
          <div>
            <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
              Why flagged
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {diagnostic.whyFlagged.length > 0 ? (
                diagnostic.whyFlagged.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-dt-border bg-dt-bg1 px-2 py-0.5 font-mono text-md text-dt-text2"
                  >
                    {reason}
                  </span>
                ))
              ) : (
                <span className="font-mono text-md text-dt-text2">No additional rule details available.</span>
              )}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3 border-t border-dt-border bg-dt-bg px-5 py-4 lg:border-l lg:border-t-0">
          <div>
            <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
              Impact
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xl font-bold text-dt-text0">
                {diagnostic.impactValue}
              </span>
              <span className="font-mono text-md text-dt-text2">{diagnostic.impactDetail}</span>
            </div>
          </div>
        </aside>

        <aside className="flex flex-col gap-3 border-t border-dt-border bg-dt-bg px-5 py-4 lg:border-l lg:border-t-0">
          <div>
            <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
              Sessions
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {diagnostic.evidenceSessionIds.length > 0 ? (
                diagnostic.evidenceSessionIds.map((sessionId) => (
                  <span
                    key={sessionId}
                    className="rounded-full border border-dt-border bg-dt-bg1 px-2 py-0.5 font-mono text-md text-dt-text2"
                  >
                    {sessionId}
                  </span>
                ))
              ) : (
                <span className="font-mono text-md text-dt-text2">No session IDs attached.</span>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
