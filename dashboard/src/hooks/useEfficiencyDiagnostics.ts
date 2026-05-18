import { useEffect, useState } from "react";
import type { EfficiencyDiagnosticsResponse } from "../lib/insightsDiagnosticsTypes";

export interface UseEfficiencyDiagnosticsResult {
  data: EfficiencyDiagnosticsResponse | null;
  loading: boolean;
  error: string | null;
  refetchKey: number;
}

export function useEfficiencyDiagnostics(
  range: string,
  repo: string,
  refreshCount: number
): UseEfficiencyDiagnosticsResult {
  const [data, setData] = useState<EfficiencyDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/efficiency/hints?range=${encodeURIComponent(range)}&repo=${encodeURIComponent(repo)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<EfficiencyDiagnosticsResponse>;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Failed to load diagnostics");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range, repo, refreshCount]);

  return { data, loading, error, refetchKey: refreshCount };
}
