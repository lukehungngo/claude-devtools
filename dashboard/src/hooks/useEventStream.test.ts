import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEventStream } from "./useEventStream";
import type { SessionEvent } from "../lib/types";

function makeEvent(uuid: string): SessionEvent {
  return { type: "user", uuid, message: { role: "user", content: "hi" } } as SessionEvent;
}

describe("useEventStream", () => {
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

    // Add 1999 events
    const batch1 = Array.from({ length: 1999 }, (_, i) => makeEvent(`a${i}`));
    act(() => {
      result.current.handleNewEvents("", "/path", batch1);
    });
    expect(result.current.liveEvents).toHaveLength(1999);

    // Add 10 more to push over 2000
    const batch2 = Array.from({ length: 10 }, (_, i) => makeEvent(`b${i}`));
    act(() => {
      result.current.handleNewEvents("", "/path", batch2);
    });

    expect(result.current.liveEvents).toHaveLength(2000);
    // First event should now be from batch1 (shifted), last from batch2
    expect(result.current.liveEvents[1999].uuid).toBe("b9");
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
});
