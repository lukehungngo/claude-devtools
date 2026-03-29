import { useState, useEffect, useCallback } from "react";
import { CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

interface DiagnosticCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

function StatusIcon({ status }: { status: DiagnosticCheck["status"] }): JSX.Element {
  switch (status) {
    case "pass":
      return <CheckCircle className="w-4 h-4 text-dt-green shrink-0" aria-label="Passed" />;
    case "warn":
      return <AlertTriangle className="w-4 h-4 text-dt-yellow shrink-0" aria-label="Warning" />;
    case "fail":
      return <XCircle className="w-4 h-4 text-dt-red shrink-0" aria-label="Failed" />;
  }
}

function formatCheckName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DoctorPanel(): JSX.Element {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/doctor");
      if (!res.ok) throw new Error("Failed to fetch diagnostics");
      const data = await res.json();
      setChecks(data.checks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-dt-text0">Diagnostics</h2>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-dt bg-dt-bg3 text-dt-text1 text-sm font-semibold border border-dt-border cursor-pointer hover:bg-dt-bg4 disabled:opacity-50 transition-colors"
          aria-label="Run diagnostics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Run Check
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-dt bg-dt-red-dim text-dt-red text-sm">
          {error}
        </div>
      )}

      {checks.length > 0 && (
        <>
          <div role="list" className="flex flex-col gap-1">
            {checks.map((check) => (
              <div
                key={check.name}
                role="listitem"
                className="flex items-center gap-3 px-3 py-2 rounded-dt bg-dt-bg2 border border-dt-border"
              >
                <StatusIcon status={check.status} />
                <span className="text-sm text-dt-text1 font-medium min-w-0">
                  {formatCheckName(check.name)}
                </span>
                <span className="ml-auto text-xs text-dt-text2 truncate">
                  {check.detail}
                </span>
              </div>
            ))}
          </div>

          <div className="text-xs text-dt-text2 px-1" aria-live="polite">
            {passCount} passed, {warnCount} warnings, {failCount} failed
          </div>
        </>
      )}

      {checks.length === 0 && !loading && !error && (
        <div className="text-sm text-dt-text2">
          Run diagnostics to check system health.
        </div>
      )}
    </div>
  );
}
