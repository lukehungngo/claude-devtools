import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StaticCompactMarker } from "./StaticCompactMarker";

describe("StaticCompactMarker", () => {
  it("renders auto trigger label with token delta and duration", () => {
    const { container } = render(
      <StaticCompactMarker
        marker={{
          uuid: "c1",
          timestamp: "2026-05-16T10:00:00Z",
          turnNumber: 42,
          trigger: "auto",
          preTokens: 168000,
          postTokens: 9000,
          durationMs: 60800,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("auto-compacted");
    expect(text).toContain("turn 42");
    expect(text).toContain("168,000");
    expect(text).toContain("9,000");
    expect(text).toContain("60.8s");
  });

  it("renders manual trigger as /compact", () => {
    const { container } = render(
      <StaticCompactMarker
        marker={{
          uuid: "c2",
          timestamp: "2026-05-16T10:00:00Z",
          turnNumber: 3,
          trigger: "manual",
          preTokens: 50000,
          postTokens: 2000,
          durationMs: 12000,
        }}
      />,
    );
    expect(container.textContent ?? "").toContain("/compact");
  });

  it("omits token delta when postTokens missing but still shows preTokens", () => {
    const { container } = render(
      <StaticCompactMarker
        marker={{
          uuid: "c3",
          timestamp: "2026-05-16T10:00:00Z",
          turnNumber: 7,
          trigger: "auto",
          preTokens: 100000,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("100,000");
    expect(text).not.toContain("→");
  });

  it("renders preCompactDiscoveredTools count in title tooltip", () => {
    const { container } = render(
      <StaticCompactMarker
        marker={{
          uuid: "c4",
          timestamp: "2026-05-16T10:00:00Z",
          turnNumber: 1,
          trigger: "auto",
          preTokens: 1000,
          preCompactDiscoveredTools: ["Read", "Write", "Bash", "Grep", "Edit", "Glob", "TodoWrite", "Task", "WebFetch", "WebSearch", "Skill", "Skill2"],
        }}
      />,
    );
    const el = container.querySelector("[title]") as HTMLElement | null;
    expect(el?.getAttribute("title") ?? "").toContain("12 tools discovered");
  });

  it("uses data-testid for assertion stability", () => {
    const { container } = render(
      <StaticCompactMarker
        marker={{
          uuid: "c5",
          timestamp: "2026-05-16T10:00:00Z",
          turnNumber: 1,
          trigger: "auto",
          preTokens: 100,
        }}
      />,
    );
    expect(container.querySelector('[data-testid="static-compact-marker"]')).not.toBeNull();
  });
});
