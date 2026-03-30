import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEventStream } from "./useEventStream";
import type { SessionEvent } from "../lib/types";

function makeEvent(uuid: string): SessionEvent {
  return { type: "user", uuid, message: { role: "user", content: "hi" } } as SessionEvent;
}

describe("useEventStream", () => {
  // By default, mock RAF to fire synchronously so existing tests work unchanged.
  // The explicit "RAF batching" describe block overrides this to test deferred behavior.
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty liveEvents initially", () => {
    const { result } = renderHook(() => useEventStream("/some/path"));
    expect(result.current.liveEvents).toEqual([]);
  });

  it("exposes handleNewEvents that adds events for matching filePath", () => {
    const { result } = renderHook(() => useEventStream("/some/path"));

    act(() => {
      result.current.handleNewEvents("", "/some/path", [makeEvent("1"), makeEvent("2")]);
    });

    expect(result.current.liveEvents).toHaveLength(2);
    expect(result.current.liveEvents[0].uuid).toBe("1");
  });

  it("ignores events for non-matching filePath", () => {
    const { result } = renderHook(() => useEventStream("/some/path"));

    act(() => {
      result.current.handleNewEvents("", "/other/path", [makeEvent("1")]);
    });

    expect(result.current.liveEvents).toHaveLength(0);
  });

  it("filters by sessionId when provided", () => {
    const { result } = renderHook(() => useEventStream("/some/path", "sess-1"));

    act(() => {
      result.current.handleNewEvents("sess-1", "/some/path", [makeEvent("1")]);
    });
    expect(result.current.liveEvents).toHaveLength(1);

    act(() => {
      result.current.handleNewEvents("sess-2", "/some/path", [makeEvent("2")]);
    });
    // Rejected because sessionId does not match
    expect(result.current.liveEvents).toHaveLength(1);
  });

  it("caps events at 2000, keeping most recent", () => {
    const { result } = renderHook(() => useEventStream("/path"));

    // Add 2010 events in a single batch to trigger the 2000 cap
    const allEvents = Array.from({ length: 2010 }, (_, i) => makeEvent(`e${i}`));
    act(() => {
      result.current.handleNewEvents("", "/path", allEvents);
    });

    expect(result.current.liveEvents).toHaveLength(2000);
    // Should keep the last 2000, so first event is e10
    expect(result.current.liveEvents[0].uuid).toBe("e10");
    expect(result.current.liveEvents[1999].uuid).toBe("e2009");
  });

  it("clearLiveEvents resets to empty", () => {
    const { result } = renderHook(() => useEventStream("/path"));

    act(() => {
      result.current.handleNewEvents("", "/path", [makeEvent("1")]);
    });
    expect(result.current.liveEvents).toHaveLength(1);

    act(() => {
      result.current.clearLiveEvents();
    });
    expect(result.current.liveEvents).toHaveLength(0);
  });

  it("resets liveEvents when sessionFilePath changes", () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useEventStream(path),
      { initialProps: { path: "/path1" as string | null } }
    );

    act(() => {
      result.current.handleNewEvents("", "/path1", [makeEvent("1")]);
    });
    expect(result.current.liveEvents).toHaveLength(1);

    rerender({ path: "/path2" });
    expect(result.current.liveEvents).toHaveLength(0);
  });

  it("does not expose isLive (removed in favor of unified WS)", () => {
    const { result } = renderHook(() => useEventStream("/path"));
    expect("isLive" in result.current).toBe(false);
  });

  describe("RAF batching", () => {
    let rafCallbacks: Array<() => void> = [];

    beforeEach(() => {
      rafCallbacks = [];
      vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("batches multiple rapid WS events into a single state update via RAF", () => {
      const { result } = renderHook(() => useEventStream("/path"));

      // Fire three rapid handleNewEvents calls WITHOUT flushing RAF
      act(() => {
        result.current.handleNewEvents("", "/path", [makeEvent("a1")]);
        result.current.handleNewEvents("", "/path", [makeEvent("a2")]);
        result.current.handleNewEvents("", "/path", [makeEvent("a3")]);
      });

      // Before RAF fires, state should NOT have the events yet
      expect(result.current.liveEvents).toHaveLength(0);

      // Now flush the RAF callback
      act(() => {
        for (const cb of rafCallbacks) cb();
        rafCallbacks = [];
      });

      // All three events should appear in a single batch
      expect(result.current.liveEvents).toHaveLength(3);
      expect(result.current.liveEvents.map(e => e.uuid)).toEqual(["a1", "a2", "a3"]);
    });

    it("still caps events at 2000 after RAF flush", () => {
      const { result } = renderHook(() => useEventStream("/path"));

      // Add 1999 events via one batch
      const batch1 = Array.from({ length: 1999 }, (_, i) => makeEvent(`a${i}`));
      act(() => {
        result.current.handleNewEvents("", "/path", batch1);
      });
      act(() => {
        for (const cb of rafCallbacks) cb();
        rafCallbacks = [];
      });
      expect(result.current.liveEvents).toHaveLength(1999);

      // Add 10 more to push over 2000
      const batch2 = Array.from({ length: 10 }, (_, i) => makeEvent(`b${i}`));
      act(() => {
        result.current.handleNewEvents("", "/path", batch2);
      });
      act(() => {
        for (const cb of rafCallbacks) cb();
        rafCallbacks = [];
      });

      expect(result.current.liveEvents).toHaveLength(2000);
      expect(result.current.liveEvents[1999].uuid).toBe("b9");
    });
  });
});
