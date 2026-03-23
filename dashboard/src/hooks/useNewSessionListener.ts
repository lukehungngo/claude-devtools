import { useEffect, useRef } from "react";

/**
 * Pure helper: parse a WebSocket message string and call onNewSession
 * if it represents a new-session event. Fails silently on malformed JSON.
 */
export function handleWsMessage(data: string, onNewSession: () => void): void {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as Record<string, unknown>).type === "new-session"
    ) {
      onNewSession();
    }
  } catch {
    // Malformed JSON — ignore
  }
}

/**
 * Listens for new-session WebSocket events from the server and calls
 * the provided callback when one is received.
 */
export function useNewSessionListener(onNewSession: () => void): void {
  const callbackRef = useRef(onNewSession);
  useEffect(() => {
    callbackRef.current = onNewSession;
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      handleWsMessage(event.data as string, () => callbackRef.current());
    };

    return () => {
      ws.close();
    };
  }, []);
}
