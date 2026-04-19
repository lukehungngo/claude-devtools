import { formatTokens, formatCost } from "../../lib/cost";

interface ModelEntry {
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
  share: number;
}

interface ModelMixProps {
  models: ModelEntry[];
}

const MODEL_COLORS = [
  "bg-dt-accent",
  "bg-dt-purple",
  "bg-dt-teal",
  "bg-dt-yellow",
  "bg-dt-orange",
  "bg-dt-red",
];

function shortenModelName(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) {
    const m = model.match(/(\d+\.\d+)/);
    return m ? `Sonnet ${m[1]}` : "Sonnet";
  }
  if (model.includes("haiku")) {
    const m = model.match(/(\d+\.\d+)/);
    return m ? `Haiku ${m[1]}` : "Haiku";
  }
  return model;
}

export function ModelMix({ models }: ModelMixProps): JSX.Element {
  if (models.length === 0) {
    return (
      <div data-testid="model-mix-empty" className="text-xs font-mono text-dt-text2 py-2">
        No model usage data
      </div>
    );
  }

  return (
    <div data-testid="model-mix" className="flex flex-col gap-4">
      {/* Stacked proportion bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {models.map((m, i) => (
          <div
            key={m.model}
            data-testid={`model-bar-${i}`}
            style={{ width: `${m.share}%` }}
            className={MODEL_COLORS[i % MODEL_COLORS.length]}
            title={`${shortenModelName(m.model)}: ${m.share.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Model row cards */}
      <div className="flex flex-col gap-0">
        {models.map((m, i) => (
          <div
            key={m.model}
            data-testid={`model-row-${i}`}
            className="flex items-center gap-3 py-2 border-b border-dt-border last:border-0"
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${MODEL_COLORS[i % MODEL_COLORS.length]}`}
              aria-hidden="true"
            />
            <span className="flex-1 text-xs font-mono text-dt-text0 truncate">
              {shortenModelName(m.model)}
            </span>
            <span className="text-xs font-mono text-dt-text2 w-12 text-right tabular-nums">
              {m.share.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-dt-text1 w-14 text-right tabular-nums">
              {formatTokens(m.tokensIn)}
            </span>
            <span className="text-xs font-mono text-dt-text1 w-14 text-right tabular-nums">
              {formatTokens(m.tokensOut)}
            </span>
            <span className="text-xs font-mono text-dt-accent w-16 text-right tabular-nums">
              {formatCost(m.cost)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
