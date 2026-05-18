import { useEffect, useMemo, useRef, useState } from "react";
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
  const [evidenceHighlighted, setEvidenceHighlighted] = useState(false);
  const evidenceRef = useRef<HTMLDivElement>(null);

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
  const patternCount = diagnostics.length === 1 ? "1 pattern" : `${diagnostics.length} patterns`;

  function jumpToEvidence(): void {
    setEvidenceHighlighted(true);
    evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectDiagnostic(id: string): void {
    if (id === selectedDiagnostic.id) {
      jumpToEvidence();
      return;
    }
    setEvidenceHighlighted(false);
    setSelectedId(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        data-testid="section-diagnostics"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-baseline gap-2.5 pb-1">
          <h2 className="text-lg font-bold text-dt-text0">{diagnosticsTitle}</h2>
          <span className="rounded-full border border-dt-border bg-dt-bg1 px-2 py-0.5 font-mono text-md text-dt-text2">
            {patternCount} ranked by impact
          </span>
          <span className="font-mono text-md text-dt-text2">
            Select a pattern to expand coaching and update evidence below.
          </span>
        </div>

        <div className="grid gap-2">
          <DiagnosticCard
            diagnostic={primary}
            variant="primary"
            selected={selectedDiagnostic.id === primary.id}
            onSelect={() => selectDiagnostic(primary.id)}
          />
          {secondary.length > 0 ? (
            secondary.map((diagnostic) => (
              <DiagnosticCard
                key={diagnostic.id}
                diagnostic={diagnostic}
                variant="secondary"
                selected={selectedDiagnostic.id === diagnostic.id}
                onSelect={() => selectDiagnostic(diagnostic.id)}
              />
            ))
          ) : (
            <div className="rounded-dt border border-dt-border bg-dt-bg2 px-3 py-3 text-md text-dt-text2">
              More diagnostics will appear when additional signals cross a threshold.
            </div>
          )}
        </div>
      </section>

      <div
        ref={evidenceRef}
        data-testid="diagnostic-evidence-anchor"
        className={evidenceHighlighted ? "rounded-dt ring-2 ring-dt-accent-dim" : "rounded-dt"}
      >
        <DiagnosticAnalysis diagnostic={selectedDiagnostic} />
      </div>
      <QuickWinsList quickWins={quickWins} />
    </div>
  );
}
