import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEfficiencyDiagnostics } from "./useEfficiencyDiagnostics";

const diagnosticsResponse = {
  range: "7d",
  period: {
    range: "7d",
    spend: 12.34,
    tokens: 120_000,
    sessions: 8,
    turns: 42,
  },
  diagnostics: [
    {
      id: "tool_failure_storm-diagnostic",
      rank: 1,
      sourcePattern: "tool_failure_storm",
      category: "quality",
      severity: "high",
      confidence: "high",
      title: "Tool failures are slowing delivery",
      summary: "8 of 40 tool calls failed",
      impactLabel: "Quality risk",
      impactValue: "8 failed calls",
      impactDetail: "this period",
      changeThisWeek: "Fix the repeated failing command before retrying.",
      evidenceChips: ["20% failure rate"],
      evidenceSessionIds: ["s1"],
      whyFlagged: ["failedToolCalls: 8"],
      tellMeMore: {
        whatHappened: "Commands failed repeatedly.",
        whyItMatters: "Repeated failures cost time.",
        recommendedChanges: [
          {
            priority: 1,
            change: "Validate paths before running commands.",
            expectedEffect: "fewer failed calls",
          },
        ],
      },
    },
  ],
  quickWins: [],
  hints: [],
  sessionCount: 8,
  totalCost: 12.34,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEfficiencyDiagnostics", () => {
  it("fetches diagnostics from the efficiency hints endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticsResponse),
    });

    const { result } = renderHook(() => useEfficiencyDiagnostics("7d", "all", 0));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith("/api/efficiency/hints?range=7d&repo=all");
    expect(result.current.data?.diagnostics[0]?.title).toBe("Tool failures are slowing delivery");
    expect(result.current.refetchKey).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("encodes range values and refetches when refreshCount changes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticsResponse),
    });

    const { result, rerender } = renderHook(
      ({ refreshCount }: { refreshCount: number }) =>
        useEfficiencyDiagnostics("last 7d", "/tmp/project", refreshCount),
      { initialProps: { refreshCount: 0 } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    fetchMock.mockClear();

    rerender({ refreshCount: 1 });
    await waitFor(() => expect(result.current.refetchKey).toBe(1));

    expect(fetchMock).toHaveBeenCalledWith("/api/efficiency/hints?range=last%207d&repo=%2Ftmp%2Fproject");
  });

  it("sets error and clears loading on HTTP failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useEfficiencyDiagnostics("7d", "all", 0));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("HTTP 500");
    expect(result.current.data).toBeNull();
  });
});
