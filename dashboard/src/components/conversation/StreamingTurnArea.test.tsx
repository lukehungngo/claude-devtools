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
});
