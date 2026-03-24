import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

interface SnapshotHistoryProps {
  turns: TurnSnapshot[];
  openIndices: Set<number>;
  onOpen: (index: number) => void;
}

export function SnapshotHistory({
  turns,
  openIndices,
  onOpen,
}: SnapshotHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closedCount = turns.length - openIndices.size;

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 2,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  if (closedCount === 0) return null;

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="flex items-center gap-1 px-2 py-1.25 text-sm font-semibold font-mono text-dt-text2 bg-transparent border-none cursor-pointer transition-colors"
      >
        <Clock size={12} />
        <span className="text-xs px-1 py-px rounded-dt-md bg-dt-bg4 text-dt-text2">
          {closedCount}
        </span>
      </button>

      {isOpen && dropdownPos && (
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownPos.top,
            right: dropdownPos.right,
            zIndex: 9999,
          }}
          className="min-w-45 max-h-64 overflow-y-auto bg-dt-bg2 border border-dt-border rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.3)] p-1 dt-scrollbar"
        >
          {turns.map((turn, i) => {
            if (openIndices.has(i)) return null;
            return (
              <button
                key={turn.turnNumber}
                onClick={() => {
                  onOpen(i);
                  setIsOpen(false);
                }}
                className="flex items-center justify-between w-full px-2 py-1.5 text-sm font-mono text-dt-text1 bg-transparent border-none rounded-dt-sm cursor-pointer transition-colors hover:bg-dt-bg3"
              >
                <span>Turn {turn.turnNumber}: {turn.promptText.slice(0, 30)}{turn.promptText.length > 30 ? "..." : ""}</span>
                <span className="text-dt-accent font-semibold text-xs">Open</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
