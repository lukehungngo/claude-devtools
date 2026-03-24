import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// We will import after creating the module
// import { useUnifiedWebSocket, dispatchWsMessage } from "./useUnifiedWebSocket";
import type { UnifiedWebSocketHandlers } from "./useUnifiedWebSocket";

describe("dispatchWsMessage (pure function)", () => {
  it("dispatches new-events messages to onNewEvents handler", async () => {
    const { dispatchWsMessage } = await import("./useUnifiedWebSocket");
    const handlers: UnifiedWebSocketHandlers = { onNewEvents: vi.fn() };
    const data = JSON.stringify({
      type: "new-events",
      filePath: "/some/path",
      events: [{ type: "user", uuid: "1" }],
    });

    dispatchWsMessage(data, handlers);

    expect(handlers.onNewEvents).toHaveBeenCalledWith("/some/path", [
      { type: "user", uuid: "1" },
    ]);
  });

  it("dispatches new-session messages to onNewSession handler", async () => {
    const { dispatchWsMessage } = await import("./useUnifiedWebSocket");
    const handlers: UnifiedWebSocketHandlers = { onNewSession: vi.fn() };
    const data = JSON.stringify({
      type: "new-session",
      filePath: "/new/session",
    });

    dispatchWsMessage(data, handlers);

    expect(handlers.onNewSession).toHaveBeenCalledWith("/new/session");
  });

  it("dispatches permission-request messages to onPermissionRequest handler", async () => {
    const { dispatchWsMessage } = await import("./useUnifiedWebSocket");
    const handlers: UnifiedWebSocketHandlers = {
      onPermissionRequest: vi.fn(),
    };
    const permission = {
      id: "p1",
      sessionId: "s1",
      agentId: "a1",
      toolName: "Bash",
      input: {},
      timestamp: "2026-01-01",
      status: "pending",
    };
    const data = JSON.stringify({
      type: "permission-request",
      permission,
    });

    dispatchWsMessage(data, handlers);

    expect(handlers.onPermissionRequest).toHaveBeenCalledWith(permission);
  });

  it("dispatches permission-resolved messages to onPermissionResolved handler", async () => {
    const { dispatchWsMessage } = await import("./useUnifiedWebSocket");
    const handlers: UnifiedWebSocketHandlers = {
      onPermissionResolved: vi.fn(),
    };
    const data = JSON.stringify({
      type: "permission-resolved",
      id: "p1",
      decision: "approved",
    });

    dispatchWsMessage(data, handlers);

    expect(handlers.onPermissionResolved).toHaveBeenCalledWith(
      "p1",
      "approved"
    );
  });

  it("ignores unknown message types without throwing", async () => {
    const { dispatchWsMessage } = await import("./useUnifiedWebSocket");
    const handlers: UnifiedWebSocketHandlers = {
      onNewEvents: vi.fn(),
      onNewSession: vi.fn(),
    };

    expect(() =>
      dispatchWsMessage(JSON.stringify({ type: "ping" }), handlers)
    ).not.toThrow();
    expect(handlers.onNewEvents).not.toHaveBeenCalled();
    expect(handlers.onNewSession).not.toHaveBeenCalled();
  });

  it("ignores malformed JSON without throwing", async () => {
    const { dispatchWsMessage } = await import("./useUnifiedWebSocket");
    const handlers: UnifiedWebSocketHandlers = { onNewEvents: vi.fn() };

    expect(() =>
      dispatchWsMessage("not-json{{{{", handlers)
    ).not.toThrow();
    expect(handlers.onNewEvents).not.toHaveBeenCalled();
  });

  it("handles missing handler gracefully (no onNewEvents provided)", async () => {
    const { dispatchWsMessage } = await import("./useUnifiedWebSocket");
    const handlers: UnifiedWebSocketHandlers = {};
    const data = JSON.stringify({
      type: "new-events",
      filePath: "/path",
      events: [],
    });

    expect(() => dispatchWsMessage(data, handlers)).not.toThrow();
  });
});

describe("useUnifiedWebSocket hook", () => {
  let MockWebSocket: ReturnType<typeof vi.fn>;
  interface MockWsInstance {
    close: ReturnType<typeof vi.fn>;
    onopen: (() => void) | null;
    onclose: (() => void) | null;
    onerror: (() => void) | null;
    onmessage: ((e: { data: string }) => void) | null;
  }
  let wsInstances: MockWsInstance[];
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    wsInstances = [];
    MockWebSocket = vi.fn(() => {
      const instance: MockWsInstance = {
        close: vi.fn(),
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
      };
      wsInstances.push(instance);
      return instance;
    });
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

  it("exports the hook function", async () => {
    const mod = await import("./useUnifiedWebSocket");
    expect(typeof mod.useUnifiedWebSocket).toBe("function");
  });

  it("creates a WebSocket connection on mount", async () => {
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    renderHook(() => useUnifiedWebSocket({}));

    expect(wsInstances).toHaveLength(1);
  });

  it("sets isConnected to true on open", async () => {
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    const { result } = renderHook(() => useUnifiedWebSocket({}));

    expect(result.current.isConnected).toBe(false);

    act(() => {
      wsInstances[0].onopen?.();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it("sets isConnected to false on close", async () => {
    vi.useFakeTimers();
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    const { result } = renderHook(() => useUnifiedWebSocket({}));

    act(() => {
      wsInstances[0].onopen?.();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      wsInstances[0].onclose?.();
    });
    expect(result.current.isConnected).toBe(false);
    vi.useRealTimers();
  });

  it("sets error on WebSocket error", async () => {
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    const { result } = renderHook(() => useUnifiedWebSocket({}));

    act(() => {
      wsInstances[0].onerror?.();
    });

    expect(result.current.error).toBe("WebSocket connection error");
  });

  it("dispatches messages to the current handler ref", async () => {
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    const onNewSession = vi.fn();
    renderHook(() => useUnifiedWebSocket({ onNewSession }));

    act(() => {
      wsInstances[0].onmessage?.({
        data: JSON.stringify({ type: "new-session", filePath: "/foo" }),
      });
    });

    expect(onNewSession).toHaveBeenCalledWith("/foo");
  });

  it("does NOT create a new WebSocket when handlers change", async () => {
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    const cb1 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useUnifiedWebSocket({ onNewSession: cb }),
      { initialProps: { cb: cb1 } }
    );

    expect(wsInstances).toHaveLength(1);

    const cb2 = vi.fn();
    rerender({ cb: cb2 });

    // Must NOT have created a second WebSocket
    expect(wsInstances).toHaveLength(1);
  });

  it("calls latest handler after re-render (ref stability)", async () => {
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    const cb1 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useUnifiedWebSocket({ onNewSession: cb }),
      { initialProps: { cb: cb1 } }
    );

    const cb2 = vi.fn();
    rerender({ cb: cb2 });

    act(() => {
      wsInstances[0].onmessage?.({
        data: JSON.stringify({ type: "new-session", filePath: "/bar" }),
      });
    });

    expect(cb2).toHaveBeenCalledWith("/bar");
    expect(cb1).not.toHaveBeenCalled();
  });

  it("closes WebSocket on unmount", async () => {
    const { useUnifiedWebSocket } = await import("./useUnifiedWebSocket");
    const { unmount } = renderHook(() => useUnifiedWebSocket({}));

    unmount();

    expect(wsInstances[0].close).toHaveBeenCalled();
  });
});
