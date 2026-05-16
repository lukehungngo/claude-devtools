import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AutoDenialBlock } from "./AutoDenialBlock";

describe("AutoDenialBlock", () => {
  it("renders tool_name, decision_reason_type badge, decision_reason, and rejection message", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "Bash",
          tool_use_id: "toolu_1",
          decision_reason_type: "classifier",
          decision_reason: "auto-mode flagged risky write",
          message: "Tool call blocked by classifier",
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Bash");
    expect(text).toContain("classifier");
    expect(text).toContain("auto-mode flagged risky write");
    expect(text).toContain("Tool call blocked by classifier");
  });

  it("uses cyan badge for classifier decision_reason_type", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "Bash",
          tool_use_id: "t1",
          decision_reason_type: "classifier",
          message: "blocked",
        }}
      />,
    );
    const badge = container.querySelector('[data-testid="auto-denial-badge"]') as HTMLElement;
    expect(badge.getAttribute("style") ?? "").toContain("var(--cat-cyan)");
  });

  it("uses amber badge for rule decision_reason_type", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "Write",
          tool_use_id: "t2",
          decision_reason_type: "rule",
          message: "blocked by deny rule",
        }}
      />,
    );
    const badge = container.querySelector('[data-testid="auto-denial-badge"]') as HTMLElement;
    expect(badge.getAttribute("style") ?? "").toContain("var(--cat-amber)");
  });

  it("uses purple badge for mode decision_reason_type", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "Edit",
          tool_use_id: "t3",
          decision_reason_type: "mode",
          message: "blocked by permission mode",
        }}
      />,
    );
    const badge = container.querySelector('[data-testid="auto-denial-badge"]') as HTMLElement;
    expect(badge.getAttribute("style") ?? "").toContain("var(--cat-purple)");
  });

  it("uses orange badge for asyncAgent decision_reason_type", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "Task",
          tool_use_id: "t4",
          decision_reason_type: "asyncAgent",
          message: "blocked by async agent permission",
        }}
      />,
    );
    const badge = container.querySelector('[data-testid="auto-denial-badge"]') as HTMLElement;
    expect(badge.getAttribute("style") ?? "").toContain("var(--cat-orange)");
  });

  it("uses red badge (--err) for unknown / missing decision_reason_type", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "MysteryTool",
          tool_use_id: "t5",
          message: "blocked for unknown reason",
        }}
      />,
    );
    const badge = container.querySelector('[data-testid="auto-denial-badge"]') as HTMLElement;
    expect(badge.getAttribute("style") ?? "").toContain("var(--err)");
  });

  it("includes data-testid for assertion stability", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "Bash",
          tool_use_id: "stable-1",
          decision_reason_type: "rule",
          message: "blocked",
        }}
      />,
    );
    expect(container.querySelector('[data-testid="auto-denial-block"]')).not.toBeNull();
  });

  it("does not render decision_reason line when omitted", () => {
    const { container } = render(
      <AutoDenialBlock
        record={{
          tool_name: "Bash",
          tool_use_id: "no-reason",
          decision_reason_type: "rule",
          message: "blocked",
        }}
      />,
    );
    expect(container.querySelector('[data-testid="auto-denial-reason"]')).toBeNull();
  });
});
