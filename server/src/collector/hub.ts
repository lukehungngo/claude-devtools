import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { logger } from "../logger.js";
import { collectorBuffer } from "./buffer.js";
import type { SessionEvent, SessionInfo, WsNewEventsMessage, WsNewSessionMessage } from "../types.js";

interface CollectorRecord {
  source: string;
  ws: WebSocket;
  connectedAt: Date;
  lastSeen: Date;
  sessionCount: number;
}

type BroadcastFn = (msg: WsNewEventsMessage | WsNewSessionMessage) => void;

interface HubOptions {
  token: string;
  onBroadcast?: BroadcastFn;
}

export class CollectorHub {
  private collectors = new Map<WebSocket, CollectorRecord>();
  private wss: WebSocketServer;
  private token: string;
  private onBroadcast?: BroadcastFn;

  constructor({ token, onBroadcast }: HubOptions) {
    this.token = token;
    this.onBroadcast = onBroadcast;

    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
      this.handleConnection(ws);
    });
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req);
    });
  }

  private handleConnection(ws: WebSocket): void {
    const authTimeout = setTimeout(() => {
      logger.warn("collector: auth timeout, closing");
      ws.close();
    }, 10_000);

    ws.once("message", (data) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(data.toString()) as { type: string; token: string; source: string };
        if (msg.type !== "collector-hello" || msg.token !== this.token) {
          logger.warn({ source: msg.source }, "collector: invalid token, closing");
          ws.close();
          return;
        }

        const record: CollectorRecord = {
          source: msg.source,
          ws,
          connectedAt: new Date(),
          lastSeen: new Date(),
          sessionCount: 0,
        };
        this.collectors.set(ws, record);
        ws.send(JSON.stringify({ type: "collector-ok" }));
        logger.info({ source: msg.source }, "collector connected");

        ws.on("message", (d) => this.handleCollectorMessage(record, d.toString()));
        ws.on("close", () => {
          logger.info({ source: record.source }, "collector disconnected");
          collectorBuffer.removeSource(record.source);
          this.collectors.delete(ws);
        });
        ws.on("error", (err) => logger.warn({ source: record.source, err }, "collector ws error"));
      } catch {
        ws.close();
      }
    });
  }

  private handleCollectorMessage(record: CollectorRecord, raw: string): void {
    record.lastSeen = new Date();
    try {
      const msg = JSON.parse(raw) as {
        type: string;
        sessionId?: string;
        filePath?: string;
        events?: SessionEvent[];
        source?: string;
      };

      if (msg.type === "new-session" && msg.sessionId) {
        const info: SessionInfo = {
          id: msg.sessionId,
          projectHash: record.source.replace(/[^a-z0-9]/gi, "-"),
          path: msg.filePath ?? "",
          startTime: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          eventCount: 0,
          subagentCount: 0,
          source: record.source,
        };
        collectorBuffer.upsertSession(info);
        record.sessionCount++;
        this.onBroadcast?.({
          type: "new-session",
          sessionId: msg.sessionId,
          filePath: msg.filePath ?? "",
          source: record.source,
        });
      } else if (msg.type === "new-events" && msg.sessionId && msg.events) {
        collectorBuffer.addEvents(msg.sessionId, msg.events);
        this.onBroadcast?.({
          type: "new-events",
          sessionId: msg.sessionId,
          filePath: msg.filePath ?? "",
          events: msg.events,
          source: record.source,
        });
      }
    } catch (err) {
      logger.warn({ err }, "collector: malformed message");
    }
  }

  getConnectedCollectors(): Array<{
    source: string;
    connectedAt: Date;
    lastSeen: Date;
    sessionCount: number;
  }> {
    return Array.from(this.collectors.values()).map(
      ({ source, connectedAt, lastSeen, sessionCount }) => ({
        source,
        connectedAt,
        lastSeen,
        sessionCount,
      })
    );
  }

  close(): void {
    this.wss.close();
  }
}
