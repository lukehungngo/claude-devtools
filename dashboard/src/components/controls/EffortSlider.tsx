import { useState, useEffect, useRef, useCallback } from "react";
import { Gauge } from "lucide-react";
import type { EffortLevel } from "../../lib/types";

interface EffortSliderProps {
  level: EffortLevel;
  onChange: (level: EffortLevel) => void;
}

const LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

const LEVEL_COLORS: Record<EffortLevel, string> = {
  low: "var(--t3)",
  medium: "var(--teal)",
  high: "var(--grn)",
  xhigh: "var(--amb)",
  max: "var(--orange)",
};

export function EffortSlider({ level, onChange }: EffortSliderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (selected: EffortLevel) => {
      onChange(selected);
      setIsOpen(false);
    },
    [onChange],
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  const color = LEVEL_COLORS[level];

  return (
    <div ref={containerRef} className="relative">
      <button
        data-testid="effort-slider-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 cursor-pointer bg-transparent border-none font-mono font-medium rounded"
        style={{
          fontSize: 10,
          color,
          padding: "2px 4px",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-h)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <Gauge size={10} />
        {level}
      </button>

      {isOpen && (
        <div
          data-testid="effort-slider-dropdown"
          className="absolute flex flex-col rounded-lg overflow-hidden"
          style={{
            top: "100%",
            left: 0,
            minWidth: 100,
            zIndex: 50,
            marginTop: 4,
            background: "var(--bg-e)",
            border: "1px solid var(--bd)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            padding: "4px 0",
          }}
        >
          {LEVELS.map((opt) => {
            const isActive = opt === level;
            return (
              <button
                key={opt}
                onClick={() => handleSelect(opt)}
                className="flex items-center cursor-pointer bg-transparent border-none font-mono font-medium text-left"
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  color: LEVEL_COLORS[opt],
                  background: isActive ? "var(--bg-h)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-h)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
