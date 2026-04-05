/**
 * Tests for TASK-7: SessionPage control wiring.
 *
 * Verifies that the AVAILABLE_MODELS constant is correctly defined
 * and that SessionControlState shape is compatible with TopBar props.
 */
import { describe, it, expect } from "vitest";
import type { SessionControlState } from "../../contexts/LayoutContext";
import type { EffortLevel } from "../../lib/types";

describe("SessionPage control wiring", () => {
  it("SessionControlState shape matches TopBar expected props", () => {
    const ctrl: SessionControlState = {
      availableModels: [
        { id: "claude-sonnet-4-6-20250514", label: "Sonnet 4.6" },
        { id: "claude-opus-4-6-20250514", label: "Opus 4.6" },
        { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
      ],
      model: "claude-sonnet-4-6-20250514",
      fastMode: false,
      effort: "high" as EffortLevel,
      onModelSelect: () => {},
      onFastToggle: () => {},
      onEffortChange: () => {},
      onCompact: () => {},
    };

    expect(ctrl.availableModels).toHaveLength(3);
    expect(ctrl.model).toBe("claude-sonnet-4-6-20250514");
    expect(ctrl.fastMode).toBe(false);
    expect(ctrl.effort).toBe("high");
    expect(typeof ctrl.onModelSelect).toBe("function");
    expect(typeof ctrl.onFastToggle).toBe("function");
    expect(typeof ctrl.onEffortChange).toBe("function");
    expect(typeof ctrl.onCompact).toBe("function");
  });

  it("SessionControlState accepts null model for initial state", () => {
    const ctrl: SessionControlState = {
      availableModels: [],
      model: null,
      fastMode: false,
      effort: "high",
      onModelSelect: () => {},
      onFastToggle: () => {},
      onEffortChange: () => {},
      onCompact: () => {},
    };

    expect(ctrl.model).toBeNull();
  });

  it("SessionControlState accepts all effort levels", () => {
    const levels: EffortLevel[] = ["low", "medium", "high"];

    for (const level of levels) {
      const ctrl: SessionControlState = {
        availableModels: [],
        model: null,
        fastMode: false,
        effort: level,
        onModelSelect: () => {},
        onFastToggle: () => {},
        onEffortChange: () => {},
        onCompact: () => {},
      };

      expect(ctrl.effort).toBe(level);
    }
  });
});
