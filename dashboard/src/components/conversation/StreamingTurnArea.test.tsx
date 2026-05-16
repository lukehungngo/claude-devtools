import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StreamingTurnArea } from "./StreamingTurnArea";
import { createInitialStreamingState } from "../../lib/streaming-types";
import type { StreamingState } from "../../lib/streaming-types";

function makeState(overrides: Partial<StreamingState> = {}): StreamingState {
  return { ...createInitialStreamingState(), ...overrides };
}

describe("StreamingTurnArea", () => {
  it("returns null when no streaming content exists", () => {
    const { container } = render(<StreamingTurnArea state={makeState()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders Claude avatar and label", () => {
    const state = makeState({ thinking: { text: "Analyzing...", isComplete: false } });
    const { container } = render(<StreamingTurnArea state={state} />);
    expect(container.textContent).toContain("C");
    expect(container.textContent).toContain("Claude");
  });

  it("renders thinking text", () => {
    const state = makeState({ thinking: { text: "Let me think about this", isComplete: false } });
    const { container } = render(<StreamingTurnArea state={state} />);
    expect(container.textContent).toContain("Let me think about this");
  });

  it("renders response text from stdout events", () => {
    const state = makeState({ responseText: "Here is my response." });
    const { container } = render(<StreamingTurnArea state={state} />);
    const responseEl = container.querySelector('[data-testid="streaming-response-text"]');
    expect(responseEl).not.toBeNull();
    expect(responseEl!.textContent).toContain("Here is my response.");
  });

  it("renders tool calls", () => {
    const tools = new Map([
      ["t1", { id: "t1", name: "Read", inputJson: "", status: "running" as const, startedAt: Date.now() }],
    ]);
    const state = makeState({ tools, toolOrder: ["t1"] });
    const { container } = render(<StreamingTurnArea state={state} />);
    expect(container.textContent).toContain("Read");
  });

  it("shows Working... indicator", () => {
    const state = makeState({ responseText: "Some text" });
    const { container } = render(<StreamingTurnArea state={state} />);
    expect(container.textContent).toContain("Working...");
  });

  it("shows compacting indicator", () => {
    const state = makeState({ isCompacting: true });
    const { container } = render(<StreamingTurnArea state={state} />);
    expect(container.textContent).toContain("Compacting conversation context...");
  });

  describe("CompactResultBanner attribution (P2-9)", () => {
    it("prepends 'Pre-compacted by <hookName>' when attributedTo set (success)", () => {
      const state = makeState({
        compactResult: {
          trigger: "auto",
          preTokens: 168470,
          postTokens: 8759,
          durationMs: 60791,
          attributedTo: { hookName: "check-rotate.sh" },
        },
      });
      const { container } = render(<StreamingTurnArea state={state} />);
      const banner = container.querySelector('[data-testid="compact-result"]');
      expect(banner).not.toBeNull();
      expect(banner!.textContent).toContain("Pre-compacted by check-rotate.sh");
      // Token info still rendered
      expect(banner!.textContent).toContain("168,470");
      expect(banner!.textContent).toContain("8,759");
    });

    it("renders blocked-by-hook banner when attributedTo.cancelled is true", () => {
      const state = makeState({
        compactResult: {
          trigger: "auto",
          preTokens: 100000,
          postTokens: 5000,
          attributedTo: {
            hookName: "guard-precompact.sh",
            cancelled: true,
            reason: "context still warm",
          },
        },
      });
      const { container } = render(<StreamingTurnArea state={state} />);
      const blocked = container.querySelector('[data-testid="compact-blocked"]');
      expect(blocked).not.toBeNull();
      expect(blocked!.textContent).toContain("Compaction blocked by PreCompact hook");
      expect(blocked!.textContent).toContain("guard-precompact.sh");
      expect(blocked!.textContent).toContain("context still warm");
      // No green compacted banner and no token info
      expect(container.querySelector('[data-testid="compact-result"]')).toBeNull();
      expect(blocked!.textContent).not.toContain("100,000");
    });

    it("renders blocked banner without reason when reason is absent", () => {
      const state = makeState({
        compactResult: {
          trigger: "auto",
          preTokens: 50,
          attributedTo: { hookName: "noisy-block.sh", cancelled: true },
        },
      });
      const { container } = render(<StreamingTurnArea state={state} />);
      const blocked = container.querySelector('[data-testid="compact-blocked"]');
      expect(blocked).not.toBeNull();
      expect(blocked!.textContent).toContain("Compaction blocked by PreCompact hook");
      expect(blocked!.textContent).toContain("noisy-block.sh");
      // No parenthesized reason segment
      expect(blocked!.textContent).not.toMatch(/\(\s*\)/);
    });
  });
});
