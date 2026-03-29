import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { ThemePicker } from "../ThemePicker";

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemePicker />
    </ThemeProvider>
  );
}

describe("ThemePicker", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a button with aria-label", () => {
    renderWithTheme();
    expect(screen.getByRole("button", { name: "Change theme" })).toBeDefined();
  });

  it("opens dropdown on click", () => {
    renderWithTheme();
    const trigger = screen.getByRole("button", { name: "Change theme" });

    act(() => {
      trigger.click();
    });

    expect(screen.getByRole("listbox")).toBeDefined();
    expect(screen.getByText("Dark")).toBeDefined();
    expect(screen.getByText("Light")).toBeDefined();
    expect(screen.getByText("High Contrast")).toBeDefined();
  });

  it("closes dropdown and switches theme on option click", () => {
    renderWithTheme();
    const trigger = screen.getByRole("button", { name: "Change theme" });

    act(() => {
      trigger.click();
    });

    act(() => {
      screen.getByText("Light").click();
    });

    // Dropdown should be closed
    expect(screen.queryByRole("listbox")).toBeNull();
    // Theme should be applied
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("marks the current theme option as selected", () => {
    renderWithTheme();
    const trigger = screen.getByRole("button", { name: "Change theme" });

    act(() => {
      trigger.click();
    });

    const darkOption = screen.getByText("Dark").closest("[role='option']");
    expect(darkOption?.getAttribute("aria-selected")).toBe("true");

    const lightOption = screen.getByText("Light").closest("[role='option']");
    expect(lightOption?.getAttribute("aria-selected")).toBe("false");
  });

  it("closes dropdown on Escape key", () => {
    renderWithTheme();
    const trigger = screen.getByRole("button", { name: "Change theme" });

    act(() => {
      trigger.click();
    });

    expect(screen.getByRole("listbox")).toBeDefined();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
