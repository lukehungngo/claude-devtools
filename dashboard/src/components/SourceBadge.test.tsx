import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceBadge } from "./SourceBadge";

describe("SourceBadge", () => {
  it("renders nothing for local source", () => {
    const { container } = render(<SourceBadge source="local" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when source is undefined", () => {
    const { container } = render(<SourceBadge source={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders docker badge", () => {
    render(<SourceBadge source="docker:my-app" />);
    expect(screen.getByText("docker:my-app")).toBeDefined();
  });

  it("renders remote badge", () => {
    render(<SourceBadge source="remote:dev.box" />);
    expect(screen.getByText("remote:dev.box")).toBeDefined();
  });
});
