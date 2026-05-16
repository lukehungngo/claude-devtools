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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/proj1/sess1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    // second fetch after refresh()
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/proj1/sess1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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

  it("does not overwrite new session state when previous session's fetch resolves late", async () => {
    const sessionAResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        metrics: { session: { id: "sessA", path: "/a", cwd: "/a" }, dag: { nodes: [], edges: [] } },
        events: [{ uuid: "a1" }],
        subagentMeta: {},
      }),
    } as unknown as Response;

    const sessionBResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        metrics: { session: { id: "sessB", path: "/b", cwd: "/b" }, dag: { nodes: [], edges: [] } },
        events: [{ uuid: "b1" }],
        subagentMeta: {},
      }),
    } as unknown as Response;

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          // FIRST call (sessA) resolves AFTER a delay — simulates slow-in-flight fetch
          return new Promise<Response>((resolve) => {
            setTimeout(() => resolve(sessionAResponse), 50);
          });
        }
        // SECOND call (sessB) resolves immediately
        return Promise.resolve(sessionBResponse);
      })
    );

    const { result, rerender } = renderHook(
      ({ proj, sess }: { proj: string; sess: string }) =>
        useSessionMetrics(proj, sess),
      { initialProps: { proj: "projA", sess: "sessA" } }
    );

    // Immediately switch to session B before A's fetch resolves
    rerender({ proj: "projA", sess: "sessB" });

    // Wait long enough for both fetches + microtasks
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Result must reflect session B, NOT the late-arriving session A
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].uuid).toBe("b1");
    expect(result.current.metrics?.session.id).toBe("sessB");
  });

  it("treats non-2xx response as error even when body contains metrics-shaped JSON", async () => {
    // A 403/500 that returns JSON shaped like valid data must NOT be accepted
    const poisonedBody = {
      metrics: { session: { id: "poison", path: "/evil", cwd: "/" }, dag: { nodes: [], edges: [] } },
      events: [{ type: "assistant" }],
      subagentMeta: {},
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve(poisonedBody),
        } as unknown as Response)
      )
    );

    const { result } = renderHook(() => useSessionMetrics("proj1", "sess1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Non-2xx body must NOT be interpreted as valid session data
    expect(result.current.metrics).toBeNull();
    expect(result.current.events).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });
});
