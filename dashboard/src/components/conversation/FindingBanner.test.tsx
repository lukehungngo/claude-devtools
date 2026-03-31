import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FindingBanner } from "./FindingBanner";

afterEach(() => {
  cleanup();
});

describe("FindingBanner", () => {
  it('renders "FLAG" label with amber styling for flag severity', () => {
    const { container } = render(
      <FindingBanner severity="flag" text="Something flagged" />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain("FLAG");
    expect(banner.textContent).toContain("Something flagged");
    expect(banner.style.borderLeft).toBe("3px solid var(--amb)");
    expect(banner.style.backgroundColor).toBe("var(--amb-bg)");
  });

  it('renders "WARNING" label with amber styling for warning severity', () => {
    const { container } = render(
      <FindingBanner severity="warning" text="A warning message" />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain("WARNING");
    expect(banner.textContent).toContain("A warning message");
    expect(banner.style.borderLeft).toBe("3px solid var(--amb)");
    expect(banner.style.backgroundColor).toBe("var(--amb-bg)");
  });

  it('renders "ERROR" label with red styling for error severity', () => {
    const { container } = render(
      <FindingBanner severity="error" text="An error occurred" />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain("ERROR");
    expect(banner.textContent).toContain("An error occurred");
    expect(banner.style.borderLeft).toBe("3px solid var(--red)");
    expect(banner.style.backgroundColor).toBe("var(--red-bg)");
  });

  it('uses role="alert" for error severity', () => {
    const { container } = render(
      <FindingBanner severity="error" text="Critical error" />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.getAttribute("role")).toBe("alert");
  });

  it('uses role="status" for flag severity', () => {
    const { container } = render(
      <FindingBanner severity="flag" text="Flag info" />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.getAttribute("role")).toBe("status");
  });

  it('uses role="status" for warning severity', () => {
    const { container } = render(
      <FindingBanner severity="warning" text="Warning info" />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.getAttribute("role")).toBe("status");
  });

  it("renders text content correctly", () => {
    const { container } = render(
      <FindingBanner severity="flag" text="Detailed finding text here" />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.textContent).toContain("Detailed finding text here");
  });
});
