import { useState, useRef, useEffect } from "react";
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closedCount = turns.length - openIndices.size;

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  if (closedCount === 0) return null;

  return (
    <div
      ref={dropdownRef}
      style={{ position: "relative", display: "inline-flex" }}
    >
      <button
        className="snap-history-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "5px 8px",
          fontSize: "10px",
          fontWeight: 600,
          fontFamily: "var(--font)",
          color: "var(--text-2)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          transition: "color 0.15s",
        }}
      >
        {"\u{1F551}"}{/* Clock icon */}
        <span
          style={{
            fontSize: "9px",
            padding: "1px 4px",
            borderRadius: "6px",
            background: "var(--bg-4)",
            color: "var(--text-2)",
          }}
        >
          {closedCount}
        </span>
      </button>

      {isOpen && (
        <div
          className="snap-history-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 50,
            minWidth: "180px",
            maxHeight: "200px",
            overflowY: "auto",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            padding: "4px",
          }}
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "10px",
                  fontFamily: "var(--font)",
                  color: "var(--text-1)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span>Turn {turn.turnNumber}: {turn.promptText.slice(0, 30)}{turn.promptText.length > 30 ? "..." : ""}</span>
                <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "9px" }}>Open</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
