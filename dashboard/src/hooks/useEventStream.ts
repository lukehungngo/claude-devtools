import { useState, useEffect, useRef, useCallback } from "react";
import type { SessionEvent } from "../lib/types";

interface NewEventsMessage {
  type: "new-events";
  filePath: string;
  events: SessionEvent[];
}

export function useEventStream(sessionFilePath: string | null) {
  const [liveEvents, setLiveEvents] = useState<SessionEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionFilePath) {
      setLiveEvents([]);
      setIsLive(false);
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setIsLive(true);
    ws.onclose = () => setIsLive(false);
    ws.onerror = () => setIsLive(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as NewEventsMessage;
        if (
          data.type === "new-events" &&
          data.filePath === sessionFilePath &&
          Array.isArray(data.events)
        ) {
          setLiveEvents((prev) => {
            const next = [...prev, ...data.events];
            if (next.length > 2000) {
              return next.slice(next.length - 2000);
            }
            return next;
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionFilePath]);

  const clearLiveEvents = useCallback(() => setLiveEvents([]), []);

  return { liveEvents, isLive, clearLiveEvents };
}
