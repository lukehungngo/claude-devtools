import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProfileDrawer } from "../ProfileDrawer";
import type { UsageInfo } from "../../lib/types";

const mockUsage: UsageInfo = {
  fiveHour: { utilization: 7, resetsAt: new Date(Date.now() + 4 * 3600_000 + 11 * 60_000).toISOString() },
  sevenDay: { utilization: 29, resetsAt: new Date(Date.now() + 6 * 24 * 3600_000 + 8 * 3600_000).toISOString() },
  planName: "Max",
};

describe("ProfileDrawer", () => {
  afterEach(() => cleanup());

  it("renders nothing visible when closed", () => {
    const { container } = render(
      <ProfileDrawer isOpen={false} onClose={vi.fn()} usage={mockUsage} />
    );
    const drawer = container.querySelector("[data-testid='profile-drawer']");
    expect(drawer).not.toBeNull();
    // Drawer exists in DOM but is translated off-screen
    const style = (drawer as HTMLElement).style.transform;
    expect(style).toBe("translateX(100%)");
  });

  it("slides in when open", () => {
    const { container } = render(
      <ProfileDrawer isOpen={true} onClose={vi.fn()} usage={mockUsage} />
    );
    const drawer = container.querySelector("[data-testid='profile-drawer']");
    expect((drawer as HTMLElement).style.transform).toBe("translateX(0)");
  });

  it("renders close button", () => {
    render(<ProfileDrawer isOpen={true} onClose={vi.fn()} usage={mockUsage} />);
    expect(screen.getByRole("button", { name: /close/i })).toBeDefined();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<ProfileDrawer isOpen={true} onClose={onClose} usage={mockUsage} />);
    screen.getByRole("button", { name: /close/i }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ProfileDrawer isOpen={true} onClose={onClose} usage={mockUsage} />
    );
    const backdrop = container.querySelector("[data-testid='drawer-backdrop']") as HTMLElement;
    backdrop.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders Preferences and Sign out footer buttons", () => {
    render(<ProfileDrawer isOpen={true} onClose={vi.fn()} usage={mockUsage} />);
    expect(screen.getByRole("button", { name: /preferences/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeDefined();
  });
});
