import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import WebSocket from "ws";
import { CollectorHub } from "./hub.js";

const TEST_TOKEN = "dt_test1234test1234test1234test1234";

describe("CollectorHub", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups) await cleanup();
    cleanups.length = 0;
  });

  it("rejects connection with wrong token", async () => {
    await new Promise<void>((resolve) => {
      const http = createServer();
      new CollectorHub({ token: TEST_TOKEN, httpServer: http });
      cleanups.push(() => new Promise((r) => http.close(() => r())));

      http.listen(0, "127.0.0.1", () => {
        const addr = http.address() as { port: number };
        const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collect`);
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "collector-hello", token: "wrong", source: "remote:test" }));
        });
        ws.on("close", () => resolve());
      });
    });
  });

  it("accepts connection with correct token and responds collector-ok", async () => {
    await new Promise<void>((resolve) => {
      const http = createServer();
      new CollectorHub({ token: TEST_TOKEN, httpServer: http });
      cleanups.push(() => new Promise((r) => http.close(() => r())));

      http.listen(0, "127.0.0.1", () => {
        const addr = http.address() as { port: number };
        const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collect`);
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "collector-hello", token: TEST_TOKEN, source: "remote:test" }));
        });
        ws.on("message", (d) => {
          const msg = JSON.parse(d.toString());
          expect(msg.type).toBe("collector-ok");
          ws.close();
          resolve();
        });
      });
    });
  });

  it("getConnectedCollectors returns registered collectors", async () => {
    await new Promise<void>((resolve) => {
      const http = createServer();
      const hub = new CollectorHub({ token: TEST_TOKEN, httpServer: http });
      cleanups.push(() => new Promise((r) => http.close(() => r())));

      http.listen(0, "127.0.0.1", () => {
        const addr = http.address() as { port: number };
        const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collect`);
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "collector-hello", token: TEST_TOKEN, source: "remote:test" }));
        });
        ws.on("message", () => {
          const collectors = hub.getConnectedCollectors();
          expect(collectors).toHaveLength(1);
          expect(collectors[0].source).toBe("remote:test");
          ws.close();
          resolve();
        });
      });
    });
  });
});
