import { describe, it, expect, vi } from "vitest";
import { WebSocket } from "ws";
import { broadcast } from "../http/server.js";
import type { ServerState } from "../http/server.js";
import type { WsBroadcastMessage } from "../types.js";

function makeMockWs(readyState: number): WebSocket {
  return {
    readyState,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe("broadcast", () => {
  it("sends JSON to all clients with OPEN readyState", () => {
    const ws1 = makeMockWs(WebSocket.OPEN);
    const ws2 = makeMockWs(WebSocket.OPEN);
    const state: ServerState = { clients: new Set([ws1, ws2]) };

    const msg: WsBroadcastMessage = {
      type: "new-session",
      filePath: "/tmp/test.jsonl",
      sessionId: "test",
    };

    broadcast(state, msg);

    const expected = JSON.stringify(msg);
    expect(ws1.send).toHaveBeenCalledWith(expected);
    expect(ws2.send).toHaveBeenCalledWith(expected);
  });

  it("skips clients with non-OPEN readyState", () => {
    const wsOpen = makeMockWs(WebSocket.OPEN);
    const wsClosing = makeMockWs(WebSocket.CLOSING);
    const wsClosed = makeMockWs(WebSocket.CLOSED);
    const wsConnecting = makeMockWs(WebSocket.CONNECTING);
    const state: ServerState = {
      clients: new Set([wsOpen, wsClosing, wsClosed, wsConnecting]),
    };

    const msg: WsBroadcastMessage = {
      type: "new-session",
      filePath: "/tmp/test.jsonl",
      sessionId: "test",
    };

    broadcast(state, msg);

    expect(wsOpen.send).toHaveBeenCalledTimes(1);
    expect(wsClosing.send).not.toHaveBeenCalled();
    expect(wsClosed.send).not.toHaveBeenCalled();
    expect(wsConnecting.send).not.toHaveBeenCalled();
  });

  it("handles empty client set without error", () => {
    const state: ServerState = { clients: new Set() };

    const msg: WsBroadcastMessage = {
      type: "permission-resolved",
      id: "perm-1",
      decision: "approved",
    };

    expect(() => broadcast(state, msg)).not.toThrow();
  });
});
