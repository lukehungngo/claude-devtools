import { ModelSwitcher } from "./ModelSwitcher";
import { FastModeToggle } from "./FastModeToggle";
import { EffortSlider } from "./EffortSlider";
import { ContextCompact } from "./ContextCompact";
import type { ModelOption } from "./ModelSwitcher";
import type { EffortLevel } from "../../lib/types";

interface ControlsZoneProps {
  currentModel: string | null;
  models: ModelOption[];
  onModelSelect: (modelId: string) => void;
  fastMode: boolean;
  onFastToggle: () => void;
  effort: EffortLevel;
  onEffortChange: (level: EffortLevel) => void;
  contextPercent: number;
  onCompact: () => void;
  isLive?: boolean;
}

export function ControlsZone({
  currentModel,
  models,
  onModelSelect,
  fastMode,
  onFastToggle,
  effort,
  onEffortChange,
  contextPercent,
  onCompact,
  isLive,
}: ControlsZoneProps) {
  if (!isLive) return null;

  return (
    <div className="flex items-center gap-1.5">
      <ModelSwitcher current={currentModel} models={models} onSelect={onModelSelect} />
      <FastModeToggle enabled={fastMode} onToggle={onFastToggle} />
      <EffortSlider level={effort} onChange={onEffortChange} />
      <div
        className="shrink-0"
        style={{ width: 1, height: 22, background: "var(--bd)" }}
      />
      <ContextCompact percent={contextPercent} onCompact={onCompact} />
    </div>
  );
}
