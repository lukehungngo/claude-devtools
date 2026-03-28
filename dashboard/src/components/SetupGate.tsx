import { useState, useEffect, useCallback } from "react";

interface SetupCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface SetupResult {
  valid: boolean;
  checks: SetupCheck[];
}

interface SetupGateProps {
  children: React.ReactNode;
}

export function SetupGate({ children }: SetupGateProps) {
  const [result, setResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const validate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/validate");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SetupResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate setup");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    validate();
  }, [validate]);

  // Pass through once validated
  if (result?.valid) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center h-screen bg-dt-bg0 text-dt-text0">
      <div className="w-full max-w-md p-8 bg-dt-bg1 border border-dt-border rounded-2xl shadow-lg">
        <h1 className="text-xl font-bold mb-1 font-sans">Claude DevTools</h1>
        <p className="text-sm text-dt-text2 mb-6">Setup Validation</p>

        {loading && (
          <div className="space-y-3">
            {["Checking CLI...", "Checking projects directory...", "Discovering sessions..."].map((label) => (
              <div key={label} className="flex items-center gap-3 text-sm text-dt-text2">
                <span className="w-4 h-4 border-2 border-dt-accent border-t-transparent rounded-full animate-spin shrink-0" />
                {label}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-dt-red">
              <span className="text-base">&#10007;</span>
              Connection failed: {error}
            </div>
            <button
              onClick={validate}
              className="w-full px-4 py-2 bg-dt-accent text-white rounded-lg font-semibold text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && result && !result.valid && (
          <div className="space-y-4">
            <div className="space-y-3">
              {result.checks.map((check) => (
                <div key={check.name} className="flex items-start gap-3 text-sm">
                  <span className={`shrink-0 text-base mt-px ${check.ok ? "text-dt-green" : "text-dt-red"}`}>
                    {check.ok ? "\u2713" : "\u2717"}
                  </span>
                  <div className="min-w-0">
                    <div className={check.ok ? "text-dt-text1" : "text-dt-text0 font-medium"}>
                      {check.name === "cli" && "Claude Code CLI"}
                      {check.name === "projects_dir" && "Projects Directory"}
                      {check.name === "sessions" && "Session Discovery"}
                    </div>
                    <div className="text-dt-text2 text-xs truncate">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-dt-border">
              <p className="text-xs text-dt-text2 mb-3">
                {!result.checks.find((c) => c.name === "cli")?.ok
                  ? "Install Claude Code CLI: npm install -g @anthropic-ai/claude-code"
                  : "Ensure Claude Code has been used at least once to create session data."}
              </p>
              <button
                onClick={validate}
                className="w-full px-4 py-2 bg-dt-accent text-white rounded-lg font-semibold text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
