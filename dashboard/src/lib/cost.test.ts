import { describe, it, expect } from "vitest";
import { formatCost, formatTokens, formatDuration } from "./cost";

describe("formatTokens", () => {
  it("formats 0 as '0'", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("formats values under 1000 as plain numbers", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(500)).toBe("500");
  });

  it("formats 1000 as '1.0K'", () => {
    expect(formatTokens(1000)).toBe("1.0K");
  });

  it("formats 1234 as '1.2K'", () => {
    expect(formatTokens(1234)).toBe("1.2K");
  });

  it("formats 10500 as '10.5K'", () => {
    expect(formatTokens(10500)).toBe("10.5K");
  });

  it("formats 1000000 as '1.0M'", () => {
    expect(formatTokens(1000000)).toBe("1.0M");
  });

  it("formats 1234567 as '1.2M'", () => {
    expect(formatTokens(1234567)).toBe("1.2M");
  });

  it("formats 15000000 as '15.0M'", () => {
    expect(formatTokens(15000000)).toBe("15.0M");
  });

  it("formats values just below 1M in K", () => {
    expect(formatTokens(999999)).toBe("1000.0K");
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
