import { useEfficiencyDiagnostics } from "../../hooks/useEfficiencyDiagnostics";
import { DiagnosticsSection } from "./DiagnosticsSection";

interface EfficiencyHintsProps {
  range: string;
}

export function EfficiencyHints({ range }: EfficiencyHintsProps): JSX.Element {
  const { data, loading, error } = useEfficiencyDiagnostics(range, "all", 0);

  return (
    <DiagnosticsSection
      diagnostics={data?.diagnostics ?? []}
      quickWins={data?.quickWins ?? []}
      loading={loading}
      error={error}
    />
  );
}
