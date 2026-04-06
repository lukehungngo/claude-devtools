import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";

export interface ModelOption {
  id: string;
  label: string;
}

interface ModelSwitcherProps {
  current: string | null;
  models: ModelOption[];
  onSelect: (modelId: string) => void;
}

export function ModelSwitcher({ current, models, onSelect }: ModelSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentModel = models.find((m) => m.id === current || (current && m.id.startsWith(current)));
  const displayLabel = currentModel?.label ?? "\u2014";

  const handleSelect = useCallback(
    (modelId: string) => {
      onSelect(modelId);
      setIsOpen(false);
    },
    [onSelect],
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

  return (
    <div ref={containerRef} className="relative">
      <button
        data-testid="model-switcher-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 cursor-pointer bg-transparent border-none font-mono font-medium rounded"
        style={{
          fontSize: 12,
          color: "var(--t1)",
          padding: "4px 6px",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-h)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {displayLabel}
        <ChevronDown size={10} style={{ color: "var(--t3)" }} />
      </button>

      {isOpen && (
        <div
          data-testid="model-switcher-dropdown"
          className="absolute flex flex-col rounded-lg overflow-hidden"
          style={{
            top: "100%",
            left: 0,
            minWidth: 160,
            zIndex: 50,
            marginTop: 4,
            background: "var(--bg-e)",
            border: "1px solid var(--bd)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            padding: "4px 0",
          }}
        >
          {models.map((model) => {
            const isActive = model.id === current || (!!current && model.id.startsWith(current));
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className="flex items-center cursor-pointer bg-transparent border-none font-mono font-medium text-left"
                style={{
                  fontSize: 11,
                  padding: "6px 12px",
                  color: isActive ? "var(--acc)" : "var(--t1)",
                  background: isActive ? "var(--acc-bg)" : "transparent",
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
                {model.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
