import { Zap } from "lucide-react";

interface FastModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function FastModeToggle({ enabled, onToggle }: FastModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 font-mono font-semibold border-none cursor-pointer rounded-md"
      style={{
        fontSize: 10,
        padding: "3px 6px",
        color: enabled ? "var(--amb)" : "var(--t3)",
        background: enabled
          ? "color-mix(in srgb, var(--amb) 15%, transparent)"
          : "transparent",
      }}
      title={enabled ? "Fast mode enabled" : "Fast mode disabled"}
    >
      <Zap size={10} />
      Fast
    </button>
  );
}
