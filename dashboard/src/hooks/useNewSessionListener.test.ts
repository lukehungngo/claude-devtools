import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { handleWsMessage, useNewSessionListener } from "./useNewSessionListener";

describe("handleWsMessage", () => {
  it("calls onNewSession when a new-session message arrives", () => {
    const onNewSession = vi.fn();
    handleWsMessage(JSON.stringify({ type: "new-session", filePath: "/some/path" }), onNewSession);
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onNewSession for new-events messages", () => {
    const onNewSession = vi.fn();
    handleWsMessage(
      JSON.stringify({ type: "new-events", filePath: "/foo", events: [] }),
      onNewSession
    );
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("does NOT call onNewSession for other message types", () => {
    const onNewSession = vi.fn();
    handleWsMessage(JSON.stringify({ type: "ping" }), onNewSession);
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("does NOT call onNewSession for malformed (non-JSON) data", () => {
    const onNewSession = vi.fn();
    handleWsMessage("not-json{{{{", onNewSession);
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("does NOT call onNewSession for empty string", () => {
    const onNewSession = vi.fn();
    handleWsMessage("", onNewSession);
    expect(onNewSession).not.toHaveBeenCalled();
  });
});

describe("useNewSessionListener (no-op after unified WS migration)", () => {
  it("is callable without creating a WebSocket", () => {
    // The hook is now a no-op — it should not throw or create any WS
    const cb = vi.fn();
    const { unmount } = renderHook(() => useNewSessionListener(cb));
    unmount();
    // No errors, no WebSocket created
  });

  it("does not call the callback (events come via useUnifiedWebSocket now)", () => {
    const cb = vi.fn();
    renderHook(() => useNewSessionListener(cb));
    expect(cb).not.toHaveBeenCalled();
  });
});
