import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TurnHistoryPanel } from "../components/TurnHistoryPanel";
import { ReopenBar } from "../components/conversation/ReopenBar";
import type { TurnSnapshot } from "../lib/turnSnapshot";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function makeTurn(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turnNumber: 1,
    promptText: "Hello world",
    startIndex: 0,
    endIndex: 5,
    agents: [],
    durationMs: 3200,
    cost: 0.0042,
    costBreakdown: { total: 0.0042, inputCost: 0.001, outputCost: 0.0032 },
    startTime: new Date(Date.now() - 120_000).toISOString(),
    endTime: new Date(Date.now() - 116_800).toISOString(),
    dispatchedAgentIds: new Set<string>(["main"]),
    ...overrides,
  };
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("TASK-002: Turn History Integration", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("ReopenBar", () => {
    it("renders with Menu icon and Conversation label", () => {
      const onReopen = vi.fn();
      render(<ReopenBar onReopen={onReopen} />);

      expect(screen.getByText("Conversation")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Open turn history panel" })).toBeTruthy();
    });

    it("calls onReopen when clicked", () => {
      const onReopen = vi.fn();
      render(<ReopenBar onReopen={onReopen} />);

      fireEvent.click(screen.getByRole("button", { name: "Open turn history panel" }));
      expect(onReopen).toHaveBeenCalledTimes(1);
    });
  });

  describe("TurnHistoryPanel scroll sync", () => {
    it("panel renders active turn with accent styling for scroll target", () => {
      const turns = [
        makeTurn({ turnNumber: 1 }),
        makeTurn({ turnNumber: 2, startIndex: 5, endIndex: 10 }),
        makeTurn({ turnNumber: 3, startIndex: 10, endIndex: 15 }),
      ];
      const { container } = render(
        <TurnHistoryPanel
          turns={turns}
          activeTurnIndex={1}
          onSelectTurn={vi.fn()}
          isOpen={true}
          onToggle={vi.fn()}
        />,
      );

      const activeItem = container.querySelector("[data-testid='turn-item-1']");
      expect(activeItem).not.toBeNull();
      expect(activeItem!.className).toContain("border-l-dt-accent");
    });
  });
});
