import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TopConsumers } from "./TopConsumers";

afterEach(cleanup);

const PROPS = {
  topRepos: [
    { slug: "/home/user/project-a", tokens: 15000, cost: 0.05 },
    { slug: "/home/user/project-b", tokens: 8000, cost: 0.03 },
  ],
  topSessions: [
    { id: "s1", label: "project-a · 2026-04-19", cost: 0.02 },
    { id: "s2", label: "project-a · 2026-04-18", cost: 0.01 },
  ],
  topTools: [
    { name: "Read", calls: 120 },
    { name: "Edit", calls: 45 },
    { name: "Bash", calls: 30 },
  ],
};

describe("TopConsumers", () => {
  it("renders three columns", () => {
    const { container } = render(<TopConsumers {...PROPS} />);
    expect(container.querySelector("[data-testid='col-repos']")).not.toBeNull();
    expect(container.querySelector("[data-testid='col-sessions']")).not.toBeNull();
    expect(container.querySelector("[data-testid='col-tools']")).not.toBeNull();
  });

  it("renders repo rows", () => {
    render(<TopConsumers {...PROPS} />);
    const rows = screen.getAllByTestId(/^repo-row-/);
    expect(rows.length).toBe(2);
  });

  it("renders session rows", () => {
    render(<TopConsumers {...PROPS} />);
    const rows = screen.getAllByTestId(/^session-row-/);
    expect(rows.length).toBe(2);
  });

  it("renders tool rows", () => {
    render(<TopConsumers {...PROPS} />);
    const rows = screen.getAllByTestId(/^tool-row-/);
    expect(rows.length).toBe(3);
  });

  it("shows repo basename not full path", () => {
    const { container } = render(<TopConsumers {...PROPS} />);
    const row0 = container.querySelector("[data-testid='repo-row-0']");
    expect(row0?.textContent).toContain("project-a");
    expect(row0?.textContent).not.toContain("/home/user/");
  });

  it("shows call count for tools", () => {
    const { container } = render(<TopConsumers {...PROPS} />);
    const toolRow = container.querySelector("[data-testid='tool-row-0']");
    expect(toolRow?.textContent).toContain("120");
  });

  it("first repo bar is wider than second (proportional)", () => {
    const { container } = render(<TopConsumers {...PROPS} />);
    const bars = Array.from(container.querySelectorAll("[data-testid^='repo-bar-']")) as HTMLElement[];
    const w0 = parseFloat(bars[0]?.style.width ?? "0");
    const w1 = parseFloat(bars[1]?.style.width ?? "0");
    expect(w0).toBeGreaterThan(w1);
  });

  it("handles empty lists gracefully", () => {
    render(<TopConsumers topRepos={[]} topSessions={[]} topTools={[]} />);
    expect(screen.getByTestId("col-repos")).toBeDefined();
  });
});
