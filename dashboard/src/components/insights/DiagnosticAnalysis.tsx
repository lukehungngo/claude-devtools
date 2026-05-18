import type { DiagnosticResult } from "../../lib/insightsDiagnosticsTypes";
import { formatCost } from "../../lib/cost";

interface DiagnosticAnalysisProps {
  diagnostic: DiagnosticResult;
}

export function DiagnosticAnalysis({ diagnostic }: DiagnosticAnalysisProps): JSX.Element {
  const statChips = diagnostic.evidenceChips.slice(0, 4);
  const ruleRows = diagnostic.whyFlagged.slice(0, 4);
  const evidenceRows =
    diagnostic.evidenceSessions?.length
      ? diagnostic.evidenceSessions
      : diagnostic.evidenceSessionIds.map((id, index) => ({
          id,
          detail: ruleRows[index] ?? "Affected session",
          cost: 0,
        }));
  const visibleRows = evidenceRows.slice(0, 6);
  const hiddenCount = Math.max(0, evidenceRows.length - visibleRows.length);

  return (
    <section
      data-testid="diagnostic-analysis"
      className="overflow-hidden rounded-dt-sm border border-dt-border bg-dt-bg1"
    >
      <div className="flex flex-wrap items-baseline gap-2.5 border-b border-dt-border bg-dt-bg2 px-3 py-2">
        <h4 className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
          Evidence
        </h4>
        <span className="font-mono text-md text-dt-text2">
          {evidenceRows.length} sessions · {diagnostic.impactDetail}
        </span>
      </div>

      <div className="grid border-b border-dt-border bg-dt-bg md:grid-cols-[minmax(16rem,1.2fr)_repeat(2,minmax(12rem,1fr))]">
        <div className="border-b border-dt-border px-3 py-2 md:border-b-0 md:border-r">
          <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
            Impact
          </div>
          <div className="mt-1 truncate font-mono text-md font-bold text-dt-text0">
            {diagnostic.impactValue}
          </div>
        </div>
        {statChips.length > 0 ? (
          statChips.slice(0, 2).map((chip, index) => (
            <div
              key={chip}
              className={[
                "border-b border-dt-border px-3 py-2 md:border-b-0",
                index === 0 ? "md:border-r" : "",
              ].join(" ")}
            >
              <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
                Signal
              </div>
              <div className="mt-1 truncate text-md font-semibold text-dt-text0" title={chip}>
                {chip}
              </div>
            </div>
          ))
        ) : (
          <div className="px-3 py-2">
            <div className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
              Signal
            </div>
            <div className="mt-1 truncate text-md text-dt-text1">No compact evidence chips available.</div>
          </div>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="font-mono text-md font-bold uppercase tracking-wide text-dt-text2">
            Affected sessions
          </span>
          {hiddenCount > 0 ? (
            <span className="font-mono text-md text-dt-text2">
              showing {visibleRows.length} of {evidenceRows.length}
            </span>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-dt-sm border border-dt-border bg-dt-bg">
        {visibleRows.length > 0 ? (
          <>
            {visibleRows.map((session) => (
              <div
                key={session.id}
                className="grid min-h-8 grid-cols-1 items-center gap-2 border-b border-dt-border px-3 py-1.5 transition-colors last:border-b-0 hover:bg-dt-bg2 md:grid-cols-[22rem_minmax(0,1fr)_auto] lg:grid-cols-[24rem_minmax(0,1fr)_auto]"
              >
                <span
                  className="min-w-0 whitespace-nowrap font-mono text-md font-semibold text-dt-text1"
                  title={session.id}
                >
                  {session.id}
                </span>
                <span className="truncate text-md text-dt-text0" title={session.detail}>
                  {session.detail}
                </span>
                {session.cost > 0 ? (
                  <span className="font-mono text-md font-bold tabular-nums text-dt-yellow">
                    {formatCost(session.cost)}
                  </span>
                ) : null}
              </div>
            ))}
            {hiddenCount > 0 ? (
              <div className="grid min-h-8 grid-cols-1 items-center gap-2 px-3 py-1.5 text-md text-dt-text2 md:grid-cols-[22rem_minmax(0,1fr)] lg:grid-cols-[24rem_minmax(0,1fr)]">
                <span className="font-mono font-bold text-dt-text2">+{hiddenCount}</span>
                <span>more affected sessions</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-3 py-2 text-md text-dt-text2">No session IDs attached.</div>
        )}
        </div>
      </div>
    </section>
  );
}
