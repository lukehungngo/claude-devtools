import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ExpandHint } from "./ExpandHint";

afterEach(cleanup);

describe("ExpandHint", () => {
  it("renders default 'click to expand' text", () => {
    const { getByText } = render(<ExpandHint />);
    expect(getByText("click to expand")).toBeTruthy();
  });

  it("renders custom text when text prop is provided", () => {
    const { getByText } = render(<ExpandHint text="show details" />);
    expect(getByText("show details")).toBeTruthy();
  });

  it("has aria-hidden='true' attribute", () => {
    const { getByText } = render(<ExpandHint />);
    const el = getByText("click to expand");
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("has opacity-0 class for hidden-by-default behavior", () => {
    const { getByText } = render(<ExpandHint />);
    const el = getByText("click to expand");
    expect(el.className).toContain("opacity-0");
  });

  it("has group-hover:opacity-100 class for hover visibility", () => {
    const { getByText } = render(<ExpandHint />);
    const el = getByText("click to expand");
    expect(el.className).toContain("group-hover:opacity-100");
  });
});
