import { useState, useEffect, useRef } from "react";
import type { SessionEvent, PermissionRequest } from "../lib/types";

// Message types matching server's WsBroadcastMessage

interface WsNewEventsMessage {
  type: "new-events";
  filePath: string;
  events: SessionEvent[];
}

interface WsNewSessionMessage {
  type: "new-session";
  filePath: string;
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
  onNewEvents?: (filePath: string, events: SessionEvent[]) => void;
  onNewSession?: (filePath: string) => void;
  onPermissionRequest?: (permission: PermissionRequest) => void;
  onPermissionResolved?: (id: string, decision: "approved" | "denied") => void;
  onUserQuestion?: (question: UserQuestion) => void;
  onQuestionAnswered?: (id: string, answer: string) => void;
}

export interface UnifiedWebSocketState {
  isConnected: boolean;
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
        handlers.onNewEvents?.(msg.filePath, msg.events);
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
 * Single multiplexed WebSocket hook with exponential backoff reconnect.
 * Replaces separate WS connections for events, sessions, and permissions.
 */
export function useUnifiedWebSocket(
  handlers: UnifiedWebSocketHandlers
): UnifiedWebSocketState {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);
  const unmountedRef = useRef(false);
  const handlersRef = useRef(handlers);

  // Keep handlers ref current without re-creating effect
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectDelay.current = 1000; // Reset backoff on success
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
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
        dispatchWsMessage(event.data as string, handlersRef.current);
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []); // Single connection for app lifetime

  return { isConnected, error };
}
