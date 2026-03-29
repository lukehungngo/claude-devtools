import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { ContextWarningBanner } from "./ContextWarningBanner";

afterEach(() => {
  cleanup();
});

describe("ContextWarningBanner", () => {
  it("does not render when contextPercent is below 90", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={85} />
    );
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();
  });

  it("shows warning banner at 90% context", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={90} />
    );
    const banner = container.querySelector("[data-testid='context-warning']");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("90%");
    expect(banner!.textContent).toContain("/compact");
    expect(banner!.className).toContain("bg-dt-yellow-dim");
    expect(banner!.className).toContain("text-dt-yellow");
  });

  it("shows critical warning at 95% context", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={95} />
    );
    const banner = container.querySelector("[data-testid='context-warning']");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("95%");
    expect(banner!.textContent).toContain("Compacting recommended");
    expect(banner!.className).toContain("bg-dt-red-dim");
    expect(banner!.className).toContain("text-dt-red");
  });

  it("renders a Compact Now button when onCompactNow is provided", () => {
    const onCompactNow = vi.fn();
    const { container } = render(
      <ContextWarningBanner contextPercent={92} onCompactNow={onCompactNow} />
    );
    const banner = container.querySelector("[data-testid='context-warning']")!;
    const btn = within(banner as HTMLElement).getByRole("button", { name: /compact now/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onCompactNow).toHaveBeenCalledTimes(1);
  });

  it("can be dismissed and reappears when context increases", () => {
    const { rerender, container } = render(
      <ContextWarningBanner contextPercent={91} />
    );
    const banner = container.querySelector("[data-testid='context-warning']")!;
    const dismissBtn = within(banner as HTMLElement).getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissBtn);
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();

    // Same percent -- stays dismissed
    rerender(<ContextWarningBanner contextPercent={91} />);
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();

    // Context increased -- reappears
    rerender(<ContextWarningBanner contextPercent={93} />);
    expect(container.querySelector("[data-testid='context-warning']")).not.toBeNull();
  });

  it("does not render when contextPercent is undefined", () => {
    const { container } = render(
      <ContextWarningBanner contextPercent={undefined} />
    );
    expect(container.querySelector("[data-testid='context-warning']")).toBeNull();
  });
});
