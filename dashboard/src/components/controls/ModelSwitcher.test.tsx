import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ModelSwitcher } from "./ModelSwitcher";
import type { ModelOption } from "./ModelSwitcher";

const MODELS: ModelOption[] = [
  { id: "claude-sonnet-4-20250514", label: "Sonnet 4" },
  { id: "claude-opus-4-20250514", label: "Opus 4" },
  { id: "claude-haiku-3.5-20250514", label: "Haiku 3.5" },
];

function renderSwitcher(overrides: Partial<{
  current: string | null;
  models: ModelOption[];
  onSelect: (modelId: string) => void;
}> = {}) {
  const props = {
    current: "current" in overrides ? overrides.current! : MODELS[0].id,
    models: overrides.models ?? MODELS,
    onSelect: overrides.onSelect ?? vi.fn(),
  };
  return { ...render(<ModelSwitcher {...props} />), props };
}

describe("ModelSwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders current model name", () => {
    renderSwitcher({ current: "claude-sonnet-4-20250514" });
    expect(screen.getByText("Sonnet 4")).toBeDefined();
  });

  it("renders dash when current is null", () => {
    renderSwitcher({ current: null });
    expect(screen.getByTestId("model-switcher-trigger").textContent).toContain("\u2014");
  });

  it("opens dropdown on click", () => {
    renderSwitcher();
    expect(screen.queryByTestId("model-switcher-dropdown")).toBeNull();
    fireEvent.click(screen.getByTestId("model-switcher-trigger"));
    expect(screen.getByTestId("model-switcher-dropdown")).toBeDefined();
    // All models should be listed in the dropdown
    const dropdown = screen.getByTestId("model-switcher-dropdown");
    for (const m of MODELS) {
      expect(dropdown.textContent).toContain(m.label);
    }
  });

  it("calls onSelect with model id when option clicked", () => {
    const onSelect = vi.fn();
    renderSwitcher({ onSelect });
    fireEvent.click(screen.getByTestId("model-switcher-trigger"));
    fireEvent.click(screen.getByText("Opus 4"));
    expect(onSelect).toHaveBeenCalledWith("claude-opus-4-20250514");
  });

  it("closes dropdown after selection", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("model-switcher-trigger"));
    expect(screen.getByTestId("model-switcher-dropdown")).toBeDefined();
    fireEvent.click(screen.getByText("Opus 4"));
    expect(screen.queryByTestId("model-switcher-dropdown")).toBeNull();
  });
});
