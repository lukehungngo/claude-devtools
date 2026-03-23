import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionMetrics } from "./useSessionData";

const mockSessionResponse = {
  metrics: { session: { id: "s1", path: "/foo", cwd: "/bar" }, dag: { nodes: [], edges: [] } },
  events: [],
  subagentMeta: {},
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve(mockSessionResponse),
      } as Response)
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSessionMetrics", () => {
  it("fetches on mount and re-fetches when refresh() is called", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    const { result } = renderHook(() => useSessionMetrics("proj1", "sess1"));

    // wait for the initial fetch to settle
    await act(async () => {
      await Promise.resolve();
    });

    // initial fetch on mount
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/proj1/sess1");

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    // second fetch after refresh()
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/sessions/proj1/sess1");
  });

  it("does not fetch when projectHash or sessionId is null", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    renderHook(() => useSessionMetrics(null, null));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refresh() is a no-op when no session is selected", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    const { result } = renderHook(() => useSessionMetrics(null, null));

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
