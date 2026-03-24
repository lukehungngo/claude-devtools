import { useState, useCallback, useRef } from "react";
import type { SessionEvent } from "../lib/types";

export function useEventStream(sessionFilePath: string | null) {
  const [liveEvents, setLiveEvents] = useState<SessionEvent[]>([]);
  const filePathRef = useRef(sessionFilePath);
  filePathRef.current = sessionFilePath;

  // Called by unified WS handler when new-events arrive
  const handleNewEvents = useCallback(
    (filePath: string, events: SessionEvent[]) => {
      if (filePath !== filePathRef.current) return;
      setLiveEvents((prev) => {
        const next = [...prev, ...events];
        if (next.length > 2000) {
          return next.slice(next.length - 2000);
        }
        return next;
      });
    },
    []
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
