import { describe, it, expect } from "vitest";
import {
  deriveObservedContextWindow,
  type ContextWindowEvent,
} from "./contextWindow";

function makeAssistant(usage: {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}): ContextWindowEvent {
  return {
    type: "assistant",
    message: { usage },
  };
}

describe("deriveObservedContextWindow (dashboard)", () => {
  it("Fixture A: all observations below 200K → 200K window", () => {
    const events: ContextWindowEvent[] = [
      makeAssistant({ input_tokens: 50_000 }),
      makeAssistant({ input_tokens: 80_000 }),
      makeAssistant({
        input_tokens: 100_000,
        cache_read_input_tokens: 15_000,
        cache_creation_input_tokens: 5_000,
      }),
    ];
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });

  it("Fixture B: an observation above 200K → 1M window", () => {
    const events: ContextWindowEvent[] = [
      makeAssistant({ input_tokens: 100_000 }),
      makeAssistant({
        input_tokens: 800_000,
        cache_read_input_tokens: 199_000,
      }),
    ];
    expect(deriveObservedContextWindow(events)).toBe(1_000_000);
  });

  it("Fixture C: exact boundary at 200_000 → still 200K", () => {
    expect(
      deriveObservedContextWindow([makeAssistant({ input_tokens: 200_000 })]),
    ).toBe(200_000);
  });

  it("Fixture D: 200_001 (one over) → bumps to 1M tier", () => {
    expect(
      deriveObservedContextWindow([makeAssistant({ input_tokens: 200_001 })]),
    ).toBe(1_000_000);
  });

  it("Fixture E: empty events → 200K default", () => {
    expect(deriveObservedContextWindow([])).toBe(200_000);
  });

  it("Fixture F: assistant events without message.usage → 200K default", () => {
    const events: ContextWindowEvent[] = [{ type: "assistant", message: {} }];
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });

  it("Fixture G: only assistant events contribute (user / attachment ignored)", () => {
    const events: ContextWindowEvent[] = [
      // Malformed user with huge usage — must be ignored.
      { type: "user", message: { usage: { input_tokens: 999_999 } } },
      {
        type: "attachment",
        message: { usage: { input_tokens: 999_999 } },
      },
      makeAssistant({ input_tokens: 50_000 }),
    ];
    expect(deriveObservedContextWindow(events)).toBe(200_000);
  });

  it("treats undefined sub-fields as zero (does not crash, does not bump tier)", () => {
    expect(
      deriveObservedContextWindow([
        makeAssistant({ input_tokens: 150_000 }),
      ]),
    ).toBe(200_000);
  });
});
