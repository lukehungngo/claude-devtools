import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ControlsZone } from "./ControlsZone";
import type { ModelOption } from "./ModelSwitcher";
import type { EffortLevel } from "../../lib/types";

const MODELS: ModelOption[] = [
  { id: "claude-opus-4-20250514", label: "Opus 4.6" },
  { id: "claude-sonnet-4-20250514", label: "Sonnet 4" },
];

function renderZone(overrides: Partial<{
  currentModel: string | null;
  models: ModelOption[];
  onModelSelect: (modelId: string) => void;
  fastMode: boolean;
  onFastToggle: () => void;
  effort: EffortLevel;
  onEffortChange: (level: EffortLevel) => void;
  contextPercent: number;
  onCompact: () => void;
  isLive: boolean;
}> = {}) {
  const props = {
    currentModel: overrides.currentModel ?? MODELS[0].id,
    models: overrides.models ?? MODELS,
    onModelSelect: overrides.onModelSelect ?? vi.fn(),
    fastMode: overrides.fastMode ?? false,
    onFastToggle: overrides.onFastToggle ?? vi.fn(),
    effort: overrides.effort ?? ("high" as EffortLevel),
    onEffortChange: overrides.onEffortChange ?? vi.fn(),
    contextPercent: overrides.contextPercent ?? 45,
    onCompact: overrides.onCompact ?? vi.fn(),
    isLive: overrides.isLive ?? true,
  };
  return render(<ControlsZone {...props} />);
}

describe("ControlsZone", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all 4 controls when live", () => {
    renderZone({ isLive: true });

    // ModelSwitcher shows model label
    expect(screen.getByText("Opus 4.6")).toBeDefined();
    // FastModeToggle shows "Fast"
    expect(screen.getByText("Fast")).toBeDefined();
    // EffortSlider shows level
    expect(screen.getByText("high")).toBeDefined();
    // ContextCompact shows percent
    expect(screen.getByText("45%")).toBeDefined();
  });

  it("renders nothing when isLive is false", () => {
    const { container } = renderZone({ isLive: false });
    expect(container.innerHTML).toBe("");
  });
});
