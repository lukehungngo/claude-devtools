import { describe, it, expect } from "vitest";
import { formatCost, formatTokens, formatDuration, calculateTurnCost } from "./cost";

describe("formatTokens", () => {
  it("formats 0 as '0'", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("formats values under 1000 as plain numbers", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(500)).toBe("500");
  });

  it("formats 1000 as '1K'", () => {
    expect(formatTokens(1000)).toBe("1K");
  });

  it("formats 1234 as '1K' after rounding", () => {
    expect(formatTokens(1234)).toBe("1K");
  });

  it("formats 10500 as '11K' after rounding", () => {
    expect(formatTokens(10500)).toBe("11K");
  });

  it("formats 1000000 as '1M'", () => {
    expect(formatTokens(1000000)).toBe("1M");
  });

  it("formats 1234567 as '1M' after rounding", () => {
    expect(formatTokens(1234567)).toBe("1M");
  });

  it("formats 15000000 as '15M'", () => {
    expect(formatTokens(15000000)).toBe("15M");
  });

  it("formats values just below 1M in K with rounding", () => {
    expect(formatTokens(999999)).toBe("1000K");
  });
});

describe("formatCost", () => {
  it("formats 0 with 4 decimal places", () => {
    expect(formatCost(0)).toBe("$0.0000");
  });

  it("formats very small costs with 4 decimal places", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
    expect(formatCost(0.0099)).toBe("$0.0099");
  });

  it("formats costs between 0.01 and 1 with 3 decimal places", () => {
    expect(formatCost(0.01)).toBe("$0.010");
    expect(formatCost(0.5)).toBe("$0.500");
    expect(formatCost(0.999)).toBe("$0.999");
  });

  it("formats costs >= 1 with 2 decimal places", () => {
    expect(formatCost(1.0)).toBe("$1.00");
    expect(formatCost(13.5)).toBe("$13.50");
    expect(formatCost(100.0)).toBe("$100.00");
  });
});

describe("formatDuration", () => {
  it("formats 0ms", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("formats milliseconds under 1 second", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats seconds (1000ms-59999ms)", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(5500)).toBe("5.5s");
  });

  it("formats minutes and seconds (>= 60000ms)", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(90000)).toBe("1m 30s");
  });

  it("formats large durations in minutes", () => {
    expect(formatDuration(3600000)).toBe("60m 0s");
  });
});

describe("calculateTurnCost", () => {
  it("returns correct cost for opus model", () => {
    // opus: input=$15/M, output=$75/M
    const cost = calculateTurnCost("claude-opus-4-6", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(15 + 75, 5);
  });

  it("returns correct cost for sonnet model", () => {
    // sonnet: input=$3/M, output=$15/M
    const cost = calculateTurnCost("claude-sonnet-4-6", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 5);
  });

  it("returns correct cost for haiku model", () => {
    // haiku: input=$0.8/M, output=$4/M
    const cost = calculateTurnCost("claude-haiku-4-5-20251001", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.8 + 4, 5);
  });

  it("falls back to sonnet pricing for unknown model", () => {
    const cost = calculateTurnCost("unknown-model-v1", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 5);
  });

  it("matches partial model names with context suffix", () => {
    // Model strings from JSONL can include suffixes like [1m]
    const cost = calculateTurnCost("claude-opus-4-6[1m]", 1_000, 1_000);
    // opus: (1000 * 15 + 1000 * 75) / 1_000_000 = 0.09
    expect(cost).toBeCloseTo(0.09, 6);
  });

  it("returns 0 for zero tokens", () => {
    const cost = calculateTurnCost("claude-sonnet-4-6", 0, 0);
    expect(cost).toBe(0);
  });
});
