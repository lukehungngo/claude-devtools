import { ChevronDown, ChevronRight, Repeat, EyeOff, Layers, DollarSign, Brain, Database, TrendingUp, type LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  repeat: Repeat,
  "eye-off": EyeOff,
  layers: Layers,
  "dollar-sign": DollarSign,
  brain: Brain,
  database: Database,
  "trending-up": TrendingUp,
};

interface HintCardProps {
  icon: string;
  punchline: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function HintCard({ icon, punchline, expanded, onToggle, children }: HintCardProps): JSX.Element {
  const IconComponent = ICON_MAP[icon];

  return (
    <div className="border border-dt-border rounded-dt bg-dt-bg2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-dt-bg3 transition-colors"
      >
        <span className="flex-shrink-0 mt-1 text-dt-text-secondary">
          {IconComponent ? <IconComponent size={20} /> : <span className="text-xl">{icon}</span>}
        </span>
        <span className="text-dt-text-primary text-md flex-1">{punchline}</span>
        <span className="text-dt-text-secondary mt-0.5">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {expanded && children && (
        <div className="px-4 pb-3 border-t border-dt-border">
          {children}
        </div>
      )}
    </div>
  );
}
