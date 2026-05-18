import { useEffect, useMemo, useState } from "react";
import type { DiagnosticResult, QuickWinResult } from "../../lib/insightsDiagnosticsTypes";
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
  periodLabel = "Last 7 days",
}: DiagnosticsSectionProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  useEffect(() => {
    if (diagnostics.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId !== null && !diagnostics.some((diagnostic) => diagnostic.id === selectedId)) {
      setSelectedId(null);
      setEvidenceOpen(false);
    }
  }, [diagnostics, selectedId]);

  const selectedDiagnostic = useMemo(
    () => diagnostics.find((diagnostic) => diagnostic.id === selectedId) ?? null,
    [diagnostics, selectedId]
  );

  if (loading) return <DiagnosticsStates state="loading" />;
  if (error) return <DiagnosticsStates state="error" error={error} />;
  if (diagnostics.length === 0) return <DiagnosticsStates state="empty" />;

  const diagnosticsTitle = "Build better with AI";
  const patternCount = diagnostics.length === 1 ? "1 pattern" : `${diagnostics.length} patterns`;
  const periodText = periodLabel.toLowerCase();

  function selectDiagnostic(id: string): void {
    if (id === selectedId) {
      setSelectedId(null);
      setEvidenceOpen(false);
      return;
    }
    setEvidenceOpen(false);
    setSelectedId(id);
  }

  function toggleEvidence(): void {
    setEvidenceOpen((open) => !open);
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        data-testid="section-diagnostics"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pb-1">
          <h2 className="text-lg font-bold text-dt-text0">{diagnosticsTitle}</h2>
          <span className="text-md font-medium text-dt-text2">
            Based on your {periodText}, these are the {patternCount} that slowed you down most.
          </span>
        </div>

        <div className="grid gap-2">
          {diagnostics.map((diagnostic, index) => {
            const selected = selectedDiagnostic?.id === diagnostic.id;
            return (
              <DiagnosticCard
                key={diagnostic.id}
                diagnostic={diagnostic}
                variant={index === 0 ? "primary" : "secondary"}
                selected={selected}
                evidenceOpen={selected && evidenceOpen}
                onSelect={() => selectDiagnostic(diagnostic.id)}
                onToggleEvidence={toggleEvidence}
              />
            );
          })}
        </div>
        {diagnostics.length === 1 ? (
          <div className="rounded-dt border border-dt-border bg-dt-bg2 px-3 py-3 text-md text-dt-text2">
            More diagnostics will appear when additional signals cross a threshold.
          </div>
        ) : null}
      </section>

      <QuickWinsList quickWins={quickWins} />
    </div>
  );
}
