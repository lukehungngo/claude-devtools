import { describe, it, expect } from "vitest";
import { capPayload } from "./payload-cap.js";

describe("capPayload", () => {
  it("returns data unchanged when under cap", () => {
    const { data, truncated } = capPayload({ x: 1 }, 1000);
    expect(data).toEqual({ x: 1 });
    expect(truncated).toBe(false);
  });

  it("truncates list-shaped payloads and sets flag", () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({
      i,
      s: "x".repeat(100),
    }));
    const { data, truncated } = capPayload({ items: big }, 10_000);
    expect(truncated).toBe(true);
    expect((data as { items: unknown[] }).items.length).toBeLessThan(
      big.length,
    );
  });

  it("handles non-array data over cap gracefully", () => {
    const big = { text: "x".repeat(5000) };
    const { data, truncated } = capPayload(big, 100);
    expect(truncated).toBe(true);
    expect(data).toEqual(big); // Can't truncate non-array
  });
});
