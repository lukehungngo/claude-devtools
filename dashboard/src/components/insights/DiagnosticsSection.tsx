import { useEffect, useMemo, useState } from "react";
import type { DiagnosticResult, QuickWinResult } from "../../lib/insightsDiagnosticsTypes";
import { DiagnosticAnalysis } from "./DiagnosticAnalysis";
import { DiagnosticCard } from "./DiagnosticCard";
import { DiagnosticsStates } from "./DiagnosticsStates";
import { QuickWinsList } from "./QuickWinsList";

interface DiagnosticsSectionProps {
  diagnostics: DiagnosticResult[];
  quickWins: QuickWinResult[];
  loading: boolean;
  error: string | null;
  periodLabel?: string;
}

export function DiagnosticsSection({
  diagnostics,
  quickWins,
  loading,
  error,
  periodLabel = "This week's",
}: DiagnosticsSectionProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(diagnostics[0]?.id ?? null);

  useEffect(() => {
    if (diagnostics.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!diagnostics.some((diagnostic) => diagnostic.id === selectedId)) {
      setSelectedId(diagnostics[0]?.id ?? null);
    }
  }, [diagnostics, selectedId]);

  const selectedDiagnostic = useMemo(
    () => diagnostics.find((diagnostic) => diagnostic.id === selectedId) ?? diagnostics[0],
    [diagnostics, selectedId]
  );

  if (loading) return <DiagnosticsStates state="loading" />;
  if (error) return <DiagnosticsStates state="error" error={error} />;
  if (!selectedDiagnostic) return <DiagnosticsStates state="empty" />;

  const [primary, ...secondary] = diagnostics;
  const diagnosticsTitle = periodLabel === "Last 7 days" ? "This week's coaching" : `${periodLabel} coaching`;
  const patternLabel = diagnostics.length === 1 ? "1 pattern ranked by impact" : `${diagnostics.length} patterns ranked by impact`;

  return (
    <div className="flex flex-col gap-4">
      <section
        data-testid="section-diagnostics"
        className="flex flex-col gap-3"
      >
        <div className="flex items-baseline gap-2.5 pb-1">
          <h2 className="text-lg font-bold text-dt-text0">{diagnosticsTitle}</h2>
          <span className="font-mono text-md text-dt-text2">{patternLabel}</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
          <DiagnosticCard
            diagnostic={primary}
            variant="primary"
            selected={selectedDiagnostic.id === primary.id}
            onSelect={() => setSelectedId(primary.id)}
          />
          {secondary.length > 0 ? (
            secondary.map((diagnostic) => (
              <DiagnosticCard
                key={diagnostic.id}
                diagnostic={diagnostic}
                variant="secondary"
                selected={selectedDiagnostic.id === diagnostic.id}
                onSelect={() => setSelectedId(diagnostic.id)}
              />
            ))
          ) : (
            <div className="rounded-dt border border-dt-border bg-dt-bg2 px-3 py-3 text-md text-dt-text2">
              More diagnostics will appear when additional signals cross a threshold.
            </div>
          )}
        </div>
      </section>

      <DiagnosticAnalysis diagnostic={selectedDiagnostic} />
      <QuickWinsList quickWins={quickWins} />
    </div>
  );
}
