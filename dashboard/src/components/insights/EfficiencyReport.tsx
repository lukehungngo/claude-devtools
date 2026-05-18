import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, X, AlertTriangle } from "lucide-react";

interface HintEvidence {
  sessions: Array<{ id: string; detail: string; cost: number }>;
  recommendation: string;
  stats: Record<string, number | string>;
}

interface HintItem {
  id: string;
  category: string;
  icon: string;
  punchline: string;
  impact: number;
}

interface HintsResponse {
  hints: HintItem[];
  sessionCount: number;
  totalCost: number;
}

interface EvidenceResponse {
  hintId: string;
  category: string;
  evidence: HintEvidence;
}

interface EfficiencyReportProps {
  range: string;
  onClose: () => void;
}

export function EfficiencyReport({ range, onClose }: EfficiencyReportProps): JSX.Element {
  const [markdown, setMarkdown] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackHints, setFallbackHints] = useState<HintsResponse | null>(null);
  const [fallbackEvidence, setFallbackEvidence] = useState<Map<string, HintEvidence>>(new Map());
  const [loadingFallback, setLoadingFallback] = useState(false);

  const fetchFallbackData = useCallback(async () => {
    setLoadingFallback(true);
    try {
      const hintsRes = await fetch(`/api/efficiency/hints?range=${range}`);
      if (!hintsRes.ok) return;
      const hints: HintsResponse = await hintsRes.json();
      setFallbackHints(hints);

      // Fetch evidence for each hint
      const evidenceMap = new Map<string, HintEvidence>();
      await Promise.all(
        hints.hints.map(async (hint) => {
          try {
            const evRes = await fetch(`/api/efficiency/hints/${hint.id}/evidence`);
            if (evRes.ok) {
              const data: EvidenceResponse = await evRes.json();
              evidenceMap.set(hint.id, data.evidence);
            }
          } catch {
            // Skip individual evidence fetch failures
          }
        })
      );
      setFallbackEvidence(evidenceMap);
    } catch {
      // Fallback fetch itself failed — nothing more we can show
    } finally {
      setLoadingFallback(false);
    }
  }, [range]);

  const generate = useCallback(async () => {
    setStreaming(true);
    setMarkdown("");
    setError(null);
    setFallbackHints(null);
    setFallbackEvidence(new Map());

    try {
      const res = await fetch("/api/efficiency/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range, force: true }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string };
            if (parsed.error) {
              setError(parsed.error);
              gotError = true;
              break;
            }
            if (parsed.text) setMarkdown((prev) => prev + parsed.text);
          } catch { /* skip malformed */ }
        }
      }

      if (gotError) {
        await fetchFallbackData();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      await fetchFallbackData();
    } finally {
      setStreaming(false);
    }
  }, [range, fetchFallbackData]);

  return (
    <div className="border border-dt-border rounded-dt bg-dt-bg2 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-dt-text-primary font-semibold text-md">Full Analysis</h4>
        <button type="button" onClick={onClose} className="text-dt-text-secondary hover:text-dt-text-primary">
          <X size={16} />
        </button>
      </div>

      {!markdown && !streaming && !error && (
        <button
          type="button"
          onClick={generate}
          className="w-full py-2 px-4 bg-dt-accent text-white rounded-dt text-md hover:opacity-90 transition-opacity"
        >
          Generate Report
        </button>
      )}

      {streaming && !markdown && (
        <div className="flex items-center gap-2 text-dt-text-secondary py-4 justify-center">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-md">Generating report...</span>
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-500 text-md py-2">
            <AlertTriangle size={14} />
            <span>Could not generate the full report. Here is what we found:</span>
          </div>

          {loadingFallback && (
            <div className="flex items-center gap-2 text-dt-text-secondary py-2 justify-center">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-md">Loading evidence...</span>
            </div>
          )}

          {fallbackHints && !loadingFallback && (
            <div className="space-y-3">
              <div className="text-md text-dt-text-secondary">
                {fallbackHints.sessionCount} sessions, ${fallbackHints.totalCost.toFixed(2)} total spend
              </div>
              {fallbackHints.hints.length === 0 && (
                <p className="text-md text-dt-text-secondary">No major issues detected for this period.</p>
              )}
              {fallbackHints.hints.map((hint) => {
                const evidence = fallbackEvidence.get(hint.id);
                return (
                  <div key={hint.id} className="border border-dt-border rounded-dt p-3 space-y-2">
                    <p className="text-md text-dt-text-primary font-medium">{hint.punchline}</p>
                    {evidence && (
                      <div className="space-y-1 text-md text-dt-text-secondary">
                        {evidence.sessions.slice(0, 5).map((s) => (
                          <div key={s.id} className="font-mono">
                            {s.id.slice(0, 12)}: {s.detail}
                          </div>
                        ))}
                        <p className="mt-1 text-dt-text-primary">{evidence.recommendation}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {markdown && (
        <div className="prose prose-sm max-w-none text-dt-text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          {streaming && <Loader2 size={14} className="animate-spin inline ml-1" />}
        </div>
      )}
    </div>
  );
}
