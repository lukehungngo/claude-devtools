import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, X } from "lucide-react";

interface EfficiencyReportProps {
  range: string;
  onClose: () => void;
}

export function EfficiencyReport({ range, onClose }: EfficiencyReportProps): JSX.Element {
  const [markdown, setMarkdown] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setStreaming(true);
    setMarkdown("");
    setError(null);

    try {
      const res = await fetch("/api/efficiency/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (parsed.error) { setError(parsed.error); break; }
            if (parsed.text) setMarkdown((prev) => prev + parsed.text);
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setStreaming(false);
    }
  }, [range]);

  return (
    <div className="border border-dt-border rounded-dt bg-dt-bg2 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-dt-text-primary font-semibold text-sm">Full Analysis</h4>
        <button type="button" onClick={onClose} className="text-dt-text-secondary hover:text-dt-text-primary">
          <X size={16} />
        </button>
      </div>

      {!markdown && !streaming && !error && (
        <button
          type="button"
          onClick={generate}
          className="w-full py-2 px-4 bg-dt-accent text-white rounded-dt text-sm hover:opacity-90 transition-opacity"
        >
          Generate Report
        </button>
      )}

      {streaming && !markdown && (
        <div className="flex items-center gap-2 text-dt-text-secondary py-4 justify-center">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Generating report...</span>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm py-2">{error}</div>
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
