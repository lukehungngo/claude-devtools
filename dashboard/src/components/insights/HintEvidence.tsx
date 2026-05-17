import { useState, useEffect } from "react";
import { Loader2, ExternalLink } from "lucide-react";

interface EvidenceSession {
  id: string;
  detail: string;
  cost: number;
  wastedCost?: number;
}

interface EvidenceData {
  hintId: string;
  category: string;
  evidence: {
    sessions: EvidenceSession[];
    recommendation: string;
    stats: Record<string, number | string>;
  };
}

interface HintEvidenceProps {
  hintId: string;
}

export function HintEvidence({ hintId }: HintEvidenceProps): JSX.Element {
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/efficiency/hints/${hintId}/evidence`)
      .then((res) => res.json())
      .then((d: EvidenceData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [hintId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-dt-text-secondary">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Loading evidence...</span>
      </div>
    );
  }

  if (!data) return <div className="text-xs text-dt-text-secondary py-2">No evidence available.</div>;

  return (
    <div className="space-y-3 pt-3">
      <div className="bg-dt-bg1 rounded-dt p-3">
        <p className="text-sm text-dt-text-primary font-medium mb-1">How to fix it</p>
        <p className="text-xs text-dt-text-secondary">{data.evidence.recommendation}</p>
      </div>

      {data.evidence.sessions.length > 0 && (
        <div>
          <p className="text-xs text-dt-text-secondary font-medium mb-2">Sessions affected</p>
          <div className="space-y-1">
            {data.evidence.sessions.map((s) => (
              <a
                key={s.id}
                href={`/session/${s.id}`}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-dt-bg3 transition-colors group"
              >
                <span className="text-dt-text-primary font-mono">{s.id.slice(0, 8)}...</span>
                <span className="text-dt-text-secondary">{s.detail}</span>
                <ExternalLink size={12} className="text-dt-text-secondary opacity-0 group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
