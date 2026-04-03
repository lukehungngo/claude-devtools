import { memo } from "react";

export interface TurnDividerProps {
  turnNumber: number;
  turnIndex?: number;
  isSelected: boolean;
  onClick: () => void;
}

function TurnDividerInner({ turnNumber, turnIndex, isSelected, onClick }: TurnDividerProps) {
  return (
    <div
      className="flex items-center mt-4 mb-3"
      data-turn-index={turnIndex}
    >
      <div
        className="flex-1 border-t"
        style={{ borderColor: isSelected ? "var(--acc)" : "var(--bd)" }}
      />
      <button
        type="button"
        onClick={onClick}
        aria-label={`Go to turn ${turnNumber}`}
        aria-pressed={isSelected}
        className={`dt-focus-ring shrink-0 mx-2 font-mono text-[10px] font-medium px-2 py-0.5 rounded-[10px] leading-[1.4] cursor-pointer border ${
          isSelected
            ? "border-[var(--acc)]"
            : "border-[var(--bd)]"
        }`}
        style={{
          background: isSelected ? "var(--acc-bg)" : "var(--bg)",
          color: isSelected ? "var(--acc)" : "var(--t3)",
        }}
      >
        {`T${turnNumber}`}
      </button>
      <div
        className="flex-1 border-t"
        style={{ borderColor: isSelected ? "var(--acc)" : "var(--bd)" }}
      />
    </div>
  );
}

export const TurnDivider = memo(TurnDividerInner);
