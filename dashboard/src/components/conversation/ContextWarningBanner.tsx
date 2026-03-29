import { useState, useEffect, useRef } from "react";

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

  const message = isCritical
    ? `Context almost full (${contextPercent}%). Compacting recommended.`
    : `Context window is ${contextPercent}% full. Use /compact to free space.`;

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
          {"\u00d7"}
        </button>
      </div>
    </div>
  );
}
