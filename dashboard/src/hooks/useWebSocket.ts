import { useState, useEffect, useRef, useCallback } from "react";

interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export function useWebSocket(url: string) {
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2s
      setTimeout(() => {
        wsRef.current = new WebSocket(url);
      }, 2000);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, data]);
      } catch {
        // ignore
      }
    };

    return () => ws.close();
  }, [url]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, connected, clearMessages };
}
