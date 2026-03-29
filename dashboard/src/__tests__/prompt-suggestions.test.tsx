import { describe, it, expect } from "vitest";
import { computeSuggestion } from "../components/conversation/promptSuggestions";

describe("computeSuggestion", () => {
  it("returns build suggestion for empty conversation", () => {
    const result = computeSuggestion("", { hasMessages: false, lastTurnHadError: false });
    expect(result).toBe("Describe what you'd like to build...");
  });

  it("returns fix suggestion after error", () => {
    const result = computeSuggestion("", { hasMessages: true, lastTurnHadError: true });
    expect(result).toBe("Fix the error above");
  });

  it("returns continue suggestion after successful turn", () => {
    const result = computeSuggestion("", { hasMessages: true, lastTurnHadError: false });
    expect(result).toBe("Continue with next steps...");
  });

  it("returns null when input is not empty", () => {
    const result = computeSuggestion("hello", { hasMessages: false, lastTurnHadError: false });
    expect(result).toBeNull();
  });

  it("returns null when input starts with /", () => {
    const result = computeSuggestion("/help", { hasMessages: false, lastTurnHadError: false });
    expect(result).toBeNull();
  });
});
