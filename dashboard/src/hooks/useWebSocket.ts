import { useState, useEffect, useRef, useCallback } from "react";

interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export function useWebSocket(url: string) {
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onclose = () => {
        setConnected(false);
        if (unmountedRef.current) return;
        const attempt = reconnectAttempts.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        reconnectAttempts.current = attempt + 1;
        setTimeout(connect, delay);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);
        } catch {
          // ignore
        }
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      wsRef.current?.close();
    };
  }, [url]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, connected, clearMessages };
}
