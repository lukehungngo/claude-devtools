import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Titlebar } from "./Titlebar";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: "/" } }),
  useLocation: () => ({ pathname: "/" }),
}));

vi.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("../hooks/useInsightsNudge", () => ({
  useInsightsNudge: vi.fn(() => ({ nudgeActive: false })),
  safeWriteInsightsLastClick: vi.fn(),
}));

import { useInsightsNudge } from "../hooks/useInsightsNudge";

afterEach(() => {
  cleanup();
  (useInsightsNudge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ nudgeActive: false });
});

describe("Titlebar — Session/Insights tabs sizing", () => {
  it("renders Session and Insights buttons with text-base + py-2 + px-4 sizing", () => {
    render(<Titlebar />);
    const session = screen.getByTestId("nav-session");
    const insights = screen.getByTestId("nav-insights");

    for (const btn of [session, insights]) {
      expect(btn.className).toContain("text-base");
      expect(btn.className).toContain("py-2");
      expect(btn.className).toContain("px-4");
      expect(btn.className).not.toContain("text-xs");
      expect(btn.className).not.toContain("py-0.5");
    }
  });

  it("uses raised-contrast inactive text color (text-dt-text1, not text-dt-text2)", () => {
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights"); // inactive when pathname='/'
    expect(insights.className).toContain("text-dt-text1");
    expect(insights.className).not.toContain("text-dt-text2");
  });
});

describe("Titlebar — Insights nudge UI", () => {
  it("renders Sparkles icon inside Insights button when nudgeActive=true", () => {
    (useInsightsNudge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ nudgeActive: true });
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights");
    // lucide-react renders an <svg> for icons
    expect(insights.querySelector("svg")).not.toBeNull();
    expect(insights.className).toContain("dt-insights-pulse");
  });

  it("does NOT render Sparkles icon or pulse class when nudgeActive=false", () => {
    (useInsightsNudge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ nudgeActive: false });
    render(<Titlebar />);
    const insights = screen.getByTestId("nav-insights");
    expect(insights.querySelector("svg")).toBeNull();
    expect(insights.className).not.toContain("dt-insights-pulse");
  });
});
