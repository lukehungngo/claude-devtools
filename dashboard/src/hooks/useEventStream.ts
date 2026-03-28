import { useState, useCallback, useRef } from "react";
import type { SessionEvent } from "../lib/types";

export function useEventStream(
  sessionFilePath: string | null,
  currentSessionId: string | null = null,
) {
  const [liveEvents, setLiveEvents] = useState<SessionEvent[]>([]);
  const filePathRef = useRef(sessionFilePath);
  filePathRef.current = sessionFilePath;
  const sessionIdRef = useRef(currentSessionId);
  sessionIdRef.current = currentSessionId;

  // Called by unified WS handler when new-events arrive
  const handleNewEvents = useCallback(
    (sessionId: string, filePath: string, events: SessionEvent[]) => {
      // Primary filter: match by sessionId if available
      if (sessionIdRef.current && sessionId) {
        if (sessionId !== sessionIdRef.current) return;
      } else {
        // Secondary guard: match by filePath
        if (filePath !== filePathRef.current) return;
      }
      setLiveEvents((prev) => {
        const next = [...prev, ...events];
        if (next.length > 2000) {
          return next.slice(next.length - 2000);
        }
        return next;
      });
    },
    [],
  );

  const clearLiveEvents = useCallback(() => setLiveEvents([]), []);

  // Reset when session changes
  const prevPath = useRef(sessionFilePath);
  if (sessionFilePath !== prevPath.current) {
    prevPath.current = sessionFilePath;
    setLiveEvents([]);
  }

  return { liveEvents, handleNewEvents, clearLiveEvents };
}
