import { describe, it, expect } from "vitest";
import { shortModelName } from "./modelUtils";

describe("shortModelName", () => {
  it("strips claude- prefix", () => {
    expect(shortModelName("claude-sonnet-4-6")).toBe("sonnet-4-6");
    expect(shortModelName("claude-haiku-4-5-20251001")).toBe("haiku-4-5-20251001");
  });

  it("leaves non-claude model names unchanged", () => {
    expect(shortModelName("haiku-4-5-20251001")).toBe("haiku-4-5-20251001");
  });

  it("handles empty string", () => {
    expect(shortModelName("")).toBe("");
  });
});
