import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { PhaseGroup } from "./PhaseGroup";
import type { Phase } from "../../lib/phaseGrouping";
import type { ToolGroup } from "./ToolEntries";

afterEach(cleanup);

function makePhase(overrides: Partial<Phase> = {}): Phase {
  const defaults: Phase = {
    label: "Read configuration files",
    groups: [
      { name: "Read", entries: [{ id: "1", name: "Read", target: "foo.ts", status: "success" }], isCollapsed: false },
      { name: "Grep", entries: [{ id: "2", name: "Grep", target: "pattern", status: "success" }], isCollapsed: false },
    ] as ToolGroup[],
    status: "success",
    toolCounts: { Read: 3, Grep: 2 },
  };
  return { ...defaults, ...overrides };
}

describe("PhaseGroup", () => {
  it("renders collapsed by default for success phase", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase()}>
        <div data-testid="child-content">inner</div>
      </PhaseGroup>,
    );

    expect(container.querySelector('[data-testid="phase-group"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="phase-head"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="phase-body"]')).toBeNull();
    expect(container.querySelector('[data-testid="child-content"]')).toBeNull();
  });

  it("expands on click to show children", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase()}>
        <div data-testid="child-content">inner</div>
      </PhaseGroup>,
    );

    const head = container.querySelector('[data-testid="phase-head"]')!;
    fireEvent.click(head);

    expect(container.querySelector('[data-testid="phase-body"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="child-content"]')).toBeTruthy();
  });

  it("collapses on second click", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase()}>
        <div data-testid="child-content">inner</div>
      </PhaseGroup>,
    );

    const head = container.querySelector('[data-testid="phase-head"]')!;
    fireEvent.click(head);
    expect(container.querySelector('[data-testid="phase-body"]')).toBeTruthy();

    fireEvent.click(head);
    expect(container.querySelector('[data-testid="phase-body"]')).toBeNull();
  });

  it("auto-expands when phase status is error", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase({ status: "error" })}>
        <div data-testid="child-content">inner</div>
      </PhaseGroup>,
    );

    expect(container.querySelector('[data-testid="phase-body"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="child-content"]')).toBeTruthy();
  });

  it("renders pill badges for each tool in toolCounts", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase({ toolCounts: { Read: 5, Grep: 3, Edit: 1 } })}>
        <div>inner</div>
      </PhaseGroup>,
    );

    const pills = container.querySelectorAll('[data-testid="phase-pill"]');
    expect(pills).toHaveLength(3);

    const pillTexts = Array.from(pills).map((p) => p.textContent);
    expect(pillTexts).toContain("Read 5");
    expect(pillTexts).toContain("Grep 3");
    expect(pillTexts).toContain("Edit 1");
  });

  it("renders the phase label with ellipsis overflow", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase({ label: "A very long label that should be displayed" })}>
        <div>inner</div>
      </PhaseGroup>,
    );

    const label = container.querySelector('[data-testid="phase-label"]') as HTMLElement;
    expect(label.textContent).toBe("A very long label that should be displayed");
    expect(label.style.textOverflow).toBe("ellipsis");
  });

  it("renders success status icon", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase({ status: "success" })}>
        <div>inner</div>
      </PhaseGroup>,
    );

    const statusEl = container.querySelector('[data-testid="phase-status"]') as HTMLElement;
    expect(statusEl.textContent).toContain("\u2713");
  });

  it("renders error status icon", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase({ status: "error" })}>
        <div>inner</div>
      </PhaseGroup>,
    );

    const statusEl = container.querySelector('[data-testid="phase-status"]') as HTMLElement;
    expect(statusEl.textContent).toContain("\u2717");
  });

  it("renders running status with pulsing dot", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase({ status: "running" })}>
        <div>inner</div>
      </PhaseGroup>,
    );

    const statusEl = container.querySelector('[data-testid="phase-status"]') as HTMLElement;
    expect(statusEl.className).toContain("running-dot");
  });

  it("renders chevron that rotates when expanded", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase()}>
        <div>inner</div>
      </PhaseGroup>,
    );

    const chevron = container.querySelector('[data-testid="phase-chevron"]') as HTMLElement;
    expect(chevron.style.transform).toBe("rotate(0deg)");

    const head = container.querySelector('[data-testid="phase-head"]')!;
    fireEvent.click(head);
    expect(chevron.style.transform).toBe("rotate(90deg)");
  });

  it("auto-expands when phase transitions from running to error", () => {
    const runningPhase = makePhase({ status: "running" });
    const { container, rerender } = render(
      <PhaseGroup phase={runningPhase}>
        <div data-testid="child-content">inner</div>
      </PhaseGroup>,
    );

    // Running phase should be collapsed
    expect(container.querySelector('[data-testid="phase-body"]')).toBeNull();

    // Re-render with error status (simulating live transition)
    const errorPhase = makePhase({ status: "error" });
    rerender(
      <PhaseGroup phase={errorPhase}>
        <div data-testid="child-content">inner</div>
      </PhaseGroup>,
    );

    // Should auto-expand on error transition
    expect(container.querySelector('[data-testid="phase-body"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="child-content"]')).toBeTruthy();
  });

  it("renders empty toolCounts without pills", () => {
    const { container } = render(
      <PhaseGroup phase={makePhase({ toolCounts: {} })}>
        <div>inner</div>
      </PhaseGroup>,
    );

    expect(container.querySelectorAll('[data-testid="phase-pill"]')).toHaveLength(0);
  });
});
