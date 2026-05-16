import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { UsageTab } from "./UsageTab";
import type { UsageBreakdown } from "../../lib/usage-types";

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UsageTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the loading state before the fetch resolves", () => {
    // Never-resolving promise — component sits in loading.
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}) as Promise<Response>);
    render(<UsageTab />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("renders one row per model with token columns", async () => {
    const breakdown: UsageBreakdown = {
      perModel: [
        {
          model: "claude-sonnet-4-6",
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 200,
          cacheReadTokens: 700,
          cacheHitRatio: 0.7,
          totalCost: 0.123,
        },
        {
          model: "claude-haiku-4-5",
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          cacheHitRatio: 0,
          totalCost: 0.004,
        },
      ],
      totalCost: 0.127,
    };
    mockFetchOnce({ breakdown });

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy();
    });
    expect(screen.getByText("claude-haiku-4-5")).toBeTruthy();

    // Cache hit ratio rendered as a percentage label
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("renders the cache-hit bar with width proportional to ratio", async () => {
    const breakdown: UsageBreakdown = {
      perModel: [
        {
          model: "claude-sonnet-4-6",
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 100,
          cacheReadTokens: 300,
          cacheHitRatio: 0.6,
          totalCost: 0.05,
        },
      ],
      totalCost: 0.05,
    };
    mockFetchOnce({ breakdown });

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy();
    });

    const bar = screen.getByTestId("cache-hit-bar-claude-sonnet-4-6");
    // 0.6 → width "60%"
    expect((bar as HTMLElement).style.width).toBe("60%");
  });

  it("shows an empty state when perModel is empty", async () => {
    mockFetchOnce({ breakdown: { perModel: [], totalCost: 0 } });

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText(/no usage data/i)).toBeTruthy();
    });
  });

  it("shows an error state when the fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load usage/i)).toBeTruthy();
    });
  });

  it("shows an error state on non-OK responses", async () => {
    mockFetchOnce({ error: "server exploded" }, false, 500);

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load usage/i)).toBeTruthy();
    });
  });
});
