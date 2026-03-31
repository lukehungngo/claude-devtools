import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { VerdictBanner } from "./VerdictBanner";

afterEach(() => {
  cleanup();
});

describe("VerdictBanner", () => {
  it("renders proceed verdict with CheckCircle icon and green styling", () => {
    const { container } = render(
      <VerdictBanner verdict="proceed" summary="All checks passed" />
    );
    const banner = container.querySelector("[data-testid='verdict-banner']");
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("role")).toBe("status");
    expect(banner!.getAttribute("aria-label")).toBe("proceed: All checks passed");
    // CheckCircle icon should be present (lucide renders as svg)
    expect(banner!.querySelector("svg")).not.toBeNull();
    // Label text
    expect(banner!.textContent).toContain("PROCEED");
    // Summary text
    expect(banner!.textContent).toContain("All checks passed");
    // Green border-left via inline style
    expect((banner as HTMLElement).style.borderLeft).toContain("var(--grn)");
    // Green background via inline style
    expect((banner as HTMLElement).style.backgroundColor).toBe("var(--grn-bg)");
  });

  it("renders approved verdict with CheckCircle icon and green styling", () => {
    const { container } = render(
      <VerdictBanner verdict="approved" summary="Review approved" />
    );
    const banner = container.querySelector("[data-testid='verdict-banner']")!;
    expect(banner.textContent).toContain("APPROVED");
    expect((banner as HTMLElement).style.borderLeft).toContain("var(--grn)");
    expect((banner as HTMLElement).style.backgroundColor).toBe("var(--grn-bg)");
  });

  it("renders fail verdict with XCircle icon and red styling", () => {
    const { container } = render(
      <VerdictBanner verdict="fail" summary="Tests failed" />
    );
    const banner = container.querySelector("[data-testid='verdict-banner']")!;
    expect(banner.textContent).toContain("FAIL");
    expect(banner.textContent).toContain("Tests failed");
    expect((banner as HTMLElement).style.borderLeft).toContain("var(--red)");
    expect((banner as HTMLElement).style.backgroundColor).toBe("var(--red-bg)");
  });

  it("renders blocked verdict with XCircle icon and red styling", () => {
    const { container } = render(
      <VerdictBanner verdict="blocked" summary="Blocked by policy" />
    );
    const banner = container.querySelector("[data-testid='verdict-banner']")!;
    expect(banner.textContent).toContain("BLOCKED");
    expect((banner as HTMLElement).style.borderLeft).toContain("var(--red)");
  });

  it("renders flag verdict with AlertTriangle icon and amber styling", () => {
    const { container } = render(
      <VerdictBanner verdict="flag" summary="Needs review" />
    );
    const banner = container.querySelector("[data-testid='verdict-banner']")!;
    expect(banner.textContent).toContain("FLAG");
    expect(banner.textContent).toContain("Needs review");
    expect((banner as HTMLElement).style.borderLeft).toContain("var(--amb)");
    expect((banner as HTMLElement).style.backgroundColor).toBe("var(--amb-bg)");
  });

  it("does not render detail element when detail prop is omitted", () => {
    const { container } = render(
      <VerdictBanner verdict="proceed" summary="All good" />
    );
    const banner = container.querySelector("[data-testid='verdict-banner']")!;
    expect(banner.querySelector("[data-testid='verdict-detail']")).toBeNull();
  });

  it("renders detail text when detail prop is provided", () => {
    const { container } = render(
      <VerdictBanner
        verdict="flag"
        summary="Needs review"
        detail="3 issues found"
      />
    );
    const banner = container.querySelector("[data-testid='verdict-banner']")!;
    const detail = banner.querySelector("[data-testid='verdict-detail']");
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toBe("3 issues found");
  });

  it("has role=status on the container", () => {
    const { container } = render(
      <VerdictBanner verdict="proceed" summary="OK" />
    );
    const banner = container.querySelector("[role='status']");
    expect(banner).not.toBeNull();
  });
});
