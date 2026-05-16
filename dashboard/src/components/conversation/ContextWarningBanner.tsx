import { useState, useEffect, useRef, useContext } from "react";
import { LayoutContext } from "../../contexts/LayoutContext";

interface ContextWarningBannerProps {
  contextPercent: number | undefined;
  onCompactNow?: () => void;
}

export function ContextWarningBanner({
  contextPercent,
  onCompactNow,
}: ContextWarningBannerProps): JSX.Element | null {
  const [dismissedAtPercent, setDismissedAtPercent] = useState<number | null>(null);
  const prevPercent = useRef<number | undefined>(contextPercent);

  // Optional LayoutContext — read with useContext (not useLayoutContext) so
  // standalone tests that render the banner without a Provider still work.
  // R-4: the SDK's getContextUsage publishes autoCompactThreshold (fraction)
  // here via UsageTab; banner shows the real number when known.
  const layoutCtx = useContext(LayoutContext);
  const autoCompactThreshold = layoutCtx?.autoCompactThreshold ?? null;

  // Reset dismissed state when context increases beyond the dismissed level
  useEffect(() => {
    if (
      dismissedAtPercent !== null &&
      contextPercent !== undefined &&
      contextPercent > dismissedAtPercent
    ) {
      setDismissedAtPercent(null);
    }
    prevPercent.current = contextPercent;
  }, [contextPercent, dismissedAtPercent]);

  if (contextPercent === undefined || contextPercent < 90) {
    return null;
  }

  if (dismissedAtPercent !== null && contextPercent <= dismissedAtPercent) {
    return null;
  }

  const isCritical = contextPercent >= 95;

  const bannerClass = isCritical
    ? "bg-dt-red-dim text-dt-red"
    : "bg-dt-yellow-dim text-dt-yellow";

  // Compose copy. When the SDK threshold is known, show "X% full — autocompact
  // fires at Y%". Otherwise keep the legacy "/compact" hint so behavior is
  // unchanged for historical / non-live sessions.
  let message: string;
  if (autoCompactThreshold !== null && autoCompactThreshold > 0) {
    const thresholdPct = Math.round(autoCompactThreshold * 100);
    message = isCritical
      ? `Context almost full (${contextPercent}%). Autocompact fires at ${thresholdPct}%.`
      : `Context is ${contextPercent}% full — autocompact fires at ${thresholdPct}%.`;
  } else {
    message = isCritical
      ? `Context almost full (${contextPercent}%). Compacting recommended.`
      : `Context window is ${contextPercent}% full. Use /compact to free space.`;
  }

  return (
    <div
      data-testid="context-warning"
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium shrink-0 ${bannerClass}`}
    >
      <span>{message}</span>
      <div className="flex items-center gap-2 shrink-0">
        {onCompactNow && (
          <button
            onClick={onCompactNow}
            className="px-2.5 py-0.5 rounded-dt text-xs font-semibold bg-dt-bg3 border border-current cursor-pointer"
          >
            Compact Now
          </button>
        )}
        <button
          onClick={() => setDismissedAtPercent(contextPercent)}
          aria-label="Dismiss"
          className="bg-transparent border-none cursor-pointer text-current text-base px-1 leading-none"
        >
          {"×"}
        </button>
      </div>
    </div>
  );
}
