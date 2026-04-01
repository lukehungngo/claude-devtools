import { memo } from "react";

export interface TurnDividerProps {
  turnNumber: number;
  turnIndex?: number;
  isSelected: boolean;
  onClick: () => void;
}

const lineStyle = {
  borderTop: "1px solid var(--bd)",
} as const;

const lineSelectedStyle = {
  borderTop: "1px solid var(--acc)",
} as const;

const badgeBaseStyle = {
  fontFamily: "monospace",
  fontSize: "10px",
  fontWeight: 500,
  padding: "2px 8px",
  borderRadius: "10px",
  cursor: "pointer",
  lineHeight: 1.4,
} as const;

const badgeDefaultStyle = {
  ...badgeBaseStyle,
  background: "var(--bg)",
  color: "var(--t3)",
  border: "1px solid var(--bd)",
} as const;

const badgeSelectedStyle = {
  ...badgeBaseStyle,
  background: "var(--acc-bg)",
  color: "var(--acc)",
  border: "1px solid var(--acc)",
} as const;

function TurnDividerInner({ turnNumber, turnIndex, isSelected, onClick }: TurnDividerProps) {
  const currentLineStyle = isSelected ? lineSelectedStyle : lineStyle;
  const currentBadgeStyle = isSelected ? badgeSelectedStyle : badgeDefaultStyle;

  return (
    <div
      className="flex items-center"
      style={{ margin: "16px 0 12px 0" }}
      data-turn-index={turnIndex}
    >
      <div className="flex-1" style={currentLineStyle} />
      <button
        type="button"
        onClick={onClick}
        aria-label={`Go to turn ${turnNumber}`}
        aria-pressed={isSelected}
        className="dt-focus-ring shrink-0 mx-2"
        style={currentBadgeStyle}
      >
        {`T${turnNumber}`}
      </button>
      <div className="flex-1" style={currentLineStyle} />
    </div>
  );
}

export const TurnDivider = memo(TurnDividerInner);
