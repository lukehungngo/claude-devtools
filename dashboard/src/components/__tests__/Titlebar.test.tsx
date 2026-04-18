import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock useNavigate so Titlebar can render without a router context
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// Mock ThemeContext
vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

import { Titlebar } from "../Titlebar";

describe("Titlebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render a hardcoded 'Connected' connection pill", () => {
    render(<Titlebar />);
    // Bug: the pill always showed "Connected" regardless of actual WS state.
    // After fix, no such text should appear.
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("does not render a 'Connection status' element", () => {
    render(<Titlebar />);
    // The pill had title="Connection status" — it must be gone after the fix.
    const pill = document.querySelector("[title='Connection status']");
    expect(pill).toBeNull();
  });

  it("renders brand button", () => {
    render(<Titlebar />);
    expect(screen.getByTestId("home-button")).toBeDefined();
  });
});
