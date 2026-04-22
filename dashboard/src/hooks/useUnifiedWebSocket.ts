import { useState, useEffect, useRef } from "react";
import type { SessionEvent, PermissionRequest } from "../lib/types";

// Message types matching server's WsBroadcastMessage

interface WsNewEventsMessage {
  type: "new-events";
  filePath: string;
  sessionId?: string;
  events: SessionEvent[];
}

interface WsNewSessionMessage {
  type: "new-session";
  filePath: string;
  sessionId?: string;
}

interface WsPermissionRequestMessage {
  type: "permission-request";
  permission: PermissionRequest;
}

interface WsPermissionResolvedMessage {
  type: "permission-resolved";
  id: string;
  decision: "approved" | "denied";
}

interface WsUserQuestionMessage {
  type: "user-question";
  question: {
    id: string;
    sessionId: string;
    questionText: string;
    status: "pending" | "answered";
  };
}

interface WsQuestionAnsweredMessage {
  type: "question-answered";
  id: string;
  answer: string;
}

type WsMessage =
  | WsNewEventsMessage
  | WsNewSessionMessage
  | WsPermissionRequestMessage
  | WsPermissionResolvedMessage
  | WsUserQuestionMessage
  | WsQuestionAnsweredMessage;

export interface UserQuestion {
  id: string;
  sessionId: string;
  questionText: string;
  status: "pending" | "answered";
}

export interface UnifiedWebSocketHandlers {
  onNewEvents?: (sessionId: string, filePath: string, events: SessionEvent[]) => void;
  onNewSession?: (filePath: string) => void;
  onPermissionRequest?: (permission: PermissionRequest) => void;
  onPermissionResolved?: (id: string, decision: "approved" | "denied") => void;
  onUserQuestion?: (question: UserQuestion) => void;
  onQuestionAnswered?: (id: string, answer: string) => void;
}

export interface UnifiedWebSocketState {
  isConnected: boolean;
  wsLatency: number | null;
  error: string | null;
}

/**
 * Dispatches a raw WebSocket message string to the appropriate handler.
 * Extracted as a pure function for testability.
 */
export function dispatchWsMessage(
  data: string,
  handlers: UnifiedWebSocketHandlers
): void {
  try {
    const msg = JSON.parse(data) as WsMessage;

    switch (msg.type) {
      case "new-events":
        handlers.onNewEvents?.(msg.sessionId ?? "", msg.filePath, msg.events);
        break;
      case "new-session":
        handlers.onNewSession?.(msg.filePath);
        break;
      case "permission-request":
        handlers.onPermissionRequest?.(msg.permission);
        break;
      case "permission-resolved":
        handlers.onPermissionResolved?.(msg.id, msg.decision);
        break;
      case "user-question":
        handlers.onUserQuestion?.(msg.question);
        break;
      case "question-answered":
        handlers.onQuestionAnswered?.(msg.id, msg.answer);
        break;
    }
  } catch {
    // Ignore malformed messages
  }
}

/**
 * Checks if a raw WS message is a pong response.
 * Returns round-trip latency in ms, or null if not a pong.
 * Exported for testing.
 */
export function parsePongLatency(data: string, now: number): number | null {
  try {
    const msg = JSON.parse(data) as { type: string; ts?: number };
    if (msg.type === "pong" && typeof msg.ts === "number") {
      return now - msg.ts;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Single multiplexed WebSocket hook with exponential backoff reconnect.
 * Replaces separate WS connections for events, sessions, and permissions.
 */
export function useUnifiedWebSocket(
  handlers: UnifiedWebSocketHandlers
): UnifiedWebSocketState {
  const [isConnected, setIsConnected] = useState(false);
  const [wsLatency, setWsLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);
  const unmountedRef = useRef(false);
  const handlersRef = useRef(handlers);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep handlers ref current without re-creating effect
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
          }
        }, 15_000);
        // Only reset backoff after connection is stable for 5s
        // Prevents perpetual 1s flash cycle on flaky connections
        stableResetTimer.current = setTimeout(() => {
          reconnectDelay.current = 1000;
        }, 5000);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (stableResetTimer.current) {
          clearTimeout(stableResetTimer.current);
          stableResetTimer.current = null;
        }
        if (unmountedRef.current) return;

        // Exponential backoff reconnect: 1s -> 2s -> 4s -> ... -> 30s max
        const delay = reconnectDelay.current;
        reconnectDelay.current = Math.min(delay * 2, 30000);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = event.data as string;
        const latency = parsePongLatency(data, Date.now());
        if (latency !== null) {
          setWsLatency(latency);
          return;
        }
        dispatchWsMessage(data, handlersRef.current);
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (stableResetTimer.current) {
        clearTimeout(stableResetTimer.current);
        stableResetTimer.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []); // Single connection for app lifetime

  return { isConnected, wsLatency, error };
}
