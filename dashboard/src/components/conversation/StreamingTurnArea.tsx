import { useEffect, useState } from "react";
import { StreamingToolCall } from "./StreamingToolCall";
import { StreamingThinking } from "./StreamingThinking";
import type { StreamingState, CompactMetadata } from "../../lib/streaming-types";

interface StreamingTurnAreaProps {
  state: StreamingState;
}

/** Shows compact result for 3 seconds then fades out */
function CompactResultBanner({ result }: { result: CompactMetadata }): JSX.Element | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const tokenStr = result.preTokens > 0
    ? ` (was ${result.preTokens.toLocaleString()} tokens)`
    : "";

  return (
    <div className="flex items-center gap-2 py-1 text-sm text-dt-green italic" data-testid="compact-result">
      <span className="inline-block w-2 h-2 rounded-full bg-dt-green" />
      Context compacted{tokenStr}
    </div>
  );
}

export function StreamingTurnArea({ state }: StreamingTurnAreaProps): JSX.Element | null {
  const hasThinking = state.thinking.text.length > 0;
  const hasTools = state.toolOrder.length > 0;
  const isCompacting = state.isCompacting;
  const hasCompactResult = state.compactResult !== null;

  if (!hasThinking && !hasTools && !isCompacting && !hasCompactResult) return null;

  return (
    <div className="streaming-turn-area py-1" aria-live="polite">
      {/* Thinking block */}
      {hasThinking && (
        <StreamingThinking
          text={state.thinking.text}
          isComplete={state.thinking.isComplete}
        />
      )}

      {/* Tool calls in order */}
      {state.toolOrder.map((toolId) => {
        const entry = state.tools.get(toolId);
        if (!entry) return null;
        return <StreamingToolCall key={toolId} entry={entry} />;
      })}

      {/* Compacting status */}
      {isCompacting && (
        <div className="flex items-center gap-2 py-1 text-sm text-dt-text2 italic" data-testid="compact-spinner">
          <span className="inline-block w-2 h-2 rounded-full bg-dt-accent animate-pulse" />
          Compacting conversation context...
        </div>
      )}

      {/* Compact completed result */}
      {hasCompactResult && !isCompacting && (
        <CompactResultBanner result={state.compactResult!} />
      )}
    </div>
  );
}
