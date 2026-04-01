import { memo } from "react";
import { Menu } from "lucide-react";

interface ReopenBarProps {
  onReopen: () => void;
}

function ReopenBarInner({ onReopen }: ReopenBarProps) {
  return (
    <div
      className="flex items-center px-[10px] shrink-0 border-b border-dt-border"
      style={{ height: 30, background: "var(--bg)" }}
    >
      <button
        onClick={onReopen}
        className="flex items-center justify-center w-[20px] h-[20px] bg-transparent border-none text-dt-text3 rounded cursor-pointer hover:bg-[var(--bg-s)] hover:text-dt-text0 transition-colors duration-150"
        aria-label="Open turn history panel"
      >
        <Menu size={14} />
      </button>
      <span className="text-[10px] uppercase tracking-[0.5px] text-dt-text3 ml-[6px]">
        Conversation
      </span>
    </div>
  );
}

export const ReopenBar = memo(ReopenBarInner);
