import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../ThemeContext";

function ThemeDisplay() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("light")}>set-light</button>
      <button onClick={() => setTheme("high-contrast")}>set-hc</button>
      <button onClick={() => setTheme("dark")}>set-dark</button>
    </div>
  );
}

describe("ThemeContext", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to dark theme when no localStorage value", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("reads initial theme from localStorage", () => {
    localStorage.setItem("claude-devtools-theme", "light");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("falls back to dark for invalid localStorage value", () => {
    localStorage.setItem("claude-devtools-theme", "neon-pink");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("sets data-theme attribute on document element", () => {
    localStorage.setItem("claude-devtools-theme", "high-contrast");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("high-contrast");
  });

  it("updates theme, localStorage, and data-theme on setTheme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    act(() => {
      screen.getByText("set-light").click();
    });

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(localStorage.getItem("claude-devtools-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("sets data-theme to dark on document element for default theme", () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
