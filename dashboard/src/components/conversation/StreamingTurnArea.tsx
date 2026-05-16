import { useEffect, useState } from "react";
import { StreamingToolCall } from "./StreamingToolCall";
import { StreamingThinking } from "./StreamingThinking";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../../lib/markdownComponents";
import type { StreamingState, CompactMetadata } from "../../lib/streaming-types";

interface StreamingTurnAreaProps {
  state: StreamingState;
  /** Live session ID — forwarded to StreamingToolCall so the "Background this task" button can POST. */
  sessionId?: string;
}

/** Shows compact result for 3 seconds then fades out */
function CompactResultBanner({ result }: { result: CompactMetadata }): JSX.Element | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  // PreCompact hook BLOCKED this compaction (CC v2.1.143, P2-9).
  // Render a distinct amber banner — no token info because nothing happened.
  if (result.attributedTo?.cancelled === true) {
    const hookName = result.attributedTo.hookName;
    const reason = result.attributedTo.reason;
    const reasonSuffix = reason ? ` (${reason})` : "";
    return (
      <div
        className="flex items-center gap-2 py-1 text-sm text-dt-yellow italic"
        data-testid="compact-blocked"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-dt-yellow" />
        Compaction blocked by PreCompact hook {hookName}
        {reasonSuffix}
      </div>
    );
  }

  const parts: string[] = [];
  if (result.preTokens > 0) {
    if (result.postTokens != null && result.postTokens > 0) {
      const pct = Math.round((1 - result.postTokens / result.preTokens) * 100);
      parts.push(
        `${result.preTokens.toLocaleString()} → ${result.postTokens.toLocaleString()} tokens (-${pct}%)`,
      );
    } else {
      parts.push(`was ${result.preTokens.toLocaleString()} tokens`);
    }
  }
  if (result.durationMs != null) {
    const sec = result.durationMs / 1000;
    parts.push(`${sec.toFixed(1)}s`);
  }
  const triggerLabel = result.trigger === "auto"
    ? "auto-compacted"
    : result.trigger === "manual"
      ? "compacted via /compact"
      : `compacted (${result.trigger})`;
  const details = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
  // Successful PreCompact hook attribution: prepend the hook name.
  const prefix = result.attributedTo?.hookName
    ? `Pre-compacted by ${result.attributedTo.hookName}: `
    : "Context ";

  return (
    <div className="flex items-center gap-2 py-1 text-sm text-dt-green italic" data-testid="compact-result">
      <span className="inline-block w-2 h-2 rounded-full bg-dt-green" />
      {prefix}
      {triggerLabel}
      {details}
    </div>
  );
}

export function StreamingTurnArea({ state, sessionId }: StreamingTurnAreaProps): JSX.Element | null {
  const hasThinking = state.thinking.text.length > 0;
  const hasTools = state.toolOrder.length > 0;
  const hasResponse = state.responseText.length > 0;
  const isCompacting = state.isCompacting;
  const hasCompactResult = state.compactResult !== null;

  if (!hasThinking && !hasTools && !hasResponse && !isCompacting && !hasCompactResult) return null;

  return (
    <div className="streaming-turn-area py-1" aria-live="polite">
      {/* Claude avatar + label wrapper — mirrors TurnCard layout */}
      <div className="flex items-start gap-2.5">
        <div
          className="flex items-center justify-center shrink-0 w-7 h-7 rounded-[7px] text-[11px] font-semibold"
          style={{ background: "var(--acc-bg)", color: "var(--acc)" }}
        >
          C
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-medium mb-0.5" style={{ color: "var(--t3)" }}>
            Claude
          </div>

          {/* Thinking block */}
          {hasThinking && (
            <StreamingThinking
              text={state.thinking.text}
              isComplete={state.thinking.isComplete}
            />
          )}

          {/* Response text — render markdown inline (no border decoration) */}
          {hasResponse && (
            <div
              className="text-dt-text0 text-[13px] leading-[1.65] break-words"
              data-testid="streaming-response-text"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {state.responseText}
              </ReactMarkdown>
            </div>
          )}

          {/* Tool calls in order */}
          {state.toolOrder.map((toolId) => {
            const entry = state.tools.get(toolId);
            if (!entry) return null;
            return <StreamingToolCall key={toolId} entry={entry} sessionId={sessionId} />;
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

          {/* Streaming indicator */}
          <div className="flex items-center mt-2 text-[13px] gap-1.5" style={{ color: "var(--t2)" }}>
            <span
              className="shrink-0 inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--amb)" }}
            />
            <span>Working...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
