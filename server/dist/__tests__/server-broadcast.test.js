import { describe, it, expect, vi } from "vitest";
import { WebSocket } from "ws";
import { broadcast } from "../http/server.js";
function makeMockWs(readyState) {
    return {
        readyState,
        send: vi.fn(),
    };
}
describe("broadcast", () => {
    it("sends JSON to all clients with OPEN readyState", () => {
        const ws1 = makeMockWs(WebSocket.OPEN);
        const ws2 = makeMockWs(WebSocket.OPEN);
        const state = { clients: new Set([ws1, ws2]) };
        const msg = {
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
        const state = {
            clients: new Set([wsOpen, wsClosing, wsClosed, wsConnecting]),
        };
        const msg = {
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
        const state = { clients: new Set() };
        const msg = {
            type: "permission-resolved",
            id: "perm-1",
            decision: "approved",
        };
        expect(() => broadcast(state, msg)).not.toThrow();
    });
});
//# sourceMappingURL=server-broadcast.test.js.map