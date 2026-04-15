import { describe, it, expect } from "vitest";
import { formatModelName } from "./formatModelName";

describe("formatModelName", () => {
  it("strips claude- prefix", () => {
    expect(formatModelName("claude-sonnet-4-6")).toBe("sonnet-4-6");
  });

  it("strips trailing 8-digit date suffix", () => {
    expect(formatModelName("claude-haiku-4-5-20251001")).toBe("haiku-4-5");
  });

  it("leaves non-claude model names unchanged", () => {
    expect(formatModelName("gpt-4")).toBe("gpt-4");
  });

  it("handles model without date suffix", () => {
    expect(formatModelName("claude-opus-4-6")).toBe("opus-4-6");
  });
});
