import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { HintCard } from "./HintCard";
import { HintEvidence } from "./HintEvidence";
import { EfficiencyReport } from "./EfficiencyReport";

interface Hint {
  id: string;
  category: string;
  icon: string;
  punchline: string;
  impact: number;
  trend: string;
  drilldownAvailable: boolean;
}

interface HintsData {
  range: string;
  hints: Hint[];
  sessionCount: number;
  totalCost: number;
}

interface EfficiencyHintsProps {
  range: string;
}

export function EfficiencyHints({ range }: EfficiencyHintsProps): JSX.Element {
  const [data, setData] = useState<HintsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/efficiency/hints?range=${range}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((d: HintsData) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-dt-text-secondary py-8 justify-center">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Analyzing your sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-dt-text-secondary text-sm py-4">
        Failed to load efficiency hints.
      </div>
    );
  }

  if (!data || data.hints.length === 0) {
    return (
      <div className="text-dt-text-secondary text-sm py-4">
        {data?.sessionCount === 0
          ? `No sessions found in the last ${range}. Start using Claude Code and check back.`
          : `No major issues found in the last ${range}. Your sessions look efficient. Keep it up.`}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.hints.map((hint) => (
        <HintCard
          key={hint.id}
          icon={hint.icon}
          punchline={hint.punchline}
          expanded={expandedId === hint.id}
          onToggle={() => setExpandedId(expandedId === hint.id ? null : hint.id)}
        >
          {hint.drilldownAvailable && (
            <HintEvidence hintId={hint.id} />
          )}
        </HintCard>
      ))}

      {!showReport ? (
        <button
          type="button"
          onClick={() => setShowReport(true)}
          className="text-sm text-dt-accent hover:underline mt-2 text-left"
        >
          Tell me more...
        </button>
      ) : (
        <EfficiencyReport range={range} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
