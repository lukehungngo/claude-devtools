import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("useNewSessionListener — callback ref stability (P2a)", () => {
  let MockWebSocket: ReturnType<typeof vi.fn>;
  let wsInstances: { close: ReturnType<typeof vi.fn>; onmessage: ((e: { data: string }) => void) | null }[];
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    wsInstances = [];
    MockWebSocket = vi.fn(() => {
      const instance: { close: ReturnType<typeof vi.fn>; onmessage: ((e: { data: string }) => void) | null } = { close: vi.fn(), onmessage: null };
      wsInstances.push(instance);
      return instance;
    });
    // Replace global WebSocket with mock
    Object.defineProperty(globalThis, "WebSocket", {
      value: MockWebSocket,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "WebSocket", {
      value: originalWebSocket,
      writable: true,
      configurable: true,
    });
  });

  it("does NOT create a new WebSocket when the callback identity changes on re-render", () => {
    // First callback
    const cb1 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useNewSessionListener(cb),
      { initialProps: { cb: cb1 } }
    );

    expect(wsInstances).toHaveLength(1);

    // Re-render with a brand-new function reference (simulates unstable callback)
    const cb2 = vi.fn();
    rerender({ cb: cb2 });

    // Must NOT have created a second WebSocket — still only 1
    expect(wsInstances).toHaveLength(1);
  });

  it("calls the latest callback when a new-session message arrives after callback change", () => {
    const cb1 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useNewSessionListener(cb),
      { initialProps: { cb: cb1 } }
    );

    // Change to a new callback
    const cb2 = vi.fn();
    rerender({ cb: cb2 });

    // Simulate a new-session message arriving on the existing WebSocket
    const ws = wsInstances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: "new-session", filePath: "/foo" }) });

    // The latest callback (cb2) should be called, not cb1
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb1).not.toHaveBeenCalled();
  });
});
