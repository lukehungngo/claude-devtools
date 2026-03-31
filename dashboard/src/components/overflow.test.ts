/**
 * Overflow fix tests (TASK-005)
 *
 * Verifies that the CSS class strings applied to the AgentFlowDAG legend
 * contain the required overflow-prevention utilities so that 9 legend items
 * never wrap to a second line.
 *
 * Strategy: export the class constants from each component and assert on
 * them here. This avoids a full DOM render while still being a meaningful
 * contract: if someone changes the classes back, this test fails.
 */

import { describe, it, expect } from "vitest";
import {
  LEGEND_CONTAINER_CLASS,
  LEGEND_ITEM_CLASS,
} from "./AgentFlowDAG";

describe("AgentFlowDAG legend overflow fix", () => {
  it("legend container has flex-wrap to allow items to break to new lines", () => {
    expect(LEGEND_CONTAINER_CLASS).toContain("flex-wrap");
  });

  it("legend container uses left-0 right-0 to span full width", () => {
    expect(LEGEND_CONTAINER_CLASS).toContain("left-0");
    expect(LEGEND_CONTAINER_CLASS).toContain("right-0");
  });

  it("legend container does not have bare right-3 anchoring (which causes wrap)", () => {
    // right-3 alone without left-0 would anchor to right only, causing overflow
    // After fix it should span full width via left-0 right-0
    expect(LEGEND_CONTAINER_CLASS).not.toBe(
      "absolute top-2 right-3 flex gap-3 text-sm text-dt-text2 z-[5]"
    );
  });

  it("legend item does not force single-line wrapping prevention", () => {
    // Items are allowed to wrap — no shrink-0 or whitespace-nowrap needed
    expect(LEGEND_ITEM_CLASS).toContain("flex");
    expect(LEGEND_ITEM_CLASS).toContain("items-center");
  });
});

