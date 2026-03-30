import { describe, it, expect } from "vitest";
import { ResponseBlock } from "./ResponseBlock";

describe("ResponseBlock memo", () => {
  it("is wrapped in React.memo (has compare function)", () => {
    expect((ResponseBlock as unknown as { compare: unknown }).compare).toBeDefined();
  });
});
