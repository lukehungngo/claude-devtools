import { useState, useCallback, useRef, useEffect } from "react";
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

  // RAF batching: accumulate events in a ref, flush once per animation frame
  const pendingEventsRef = useRef<SessionEvent[]>([]);
  const rafRef = useRef<number | null>(null);

  // Clean up pending RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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
      // Accumulate into pending buffer
      pendingEventsRef.current.push(...events);
      // Schedule a single flush per animation frame
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          const batch = pendingEventsRef.current;
          pendingEventsRef.current = [];
          rafRef.current = null;
          setLiveEvents((prev) => {
            const next = [...prev, ...batch];
            if (next.length > 2000) {
              return next.slice(next.length - 2000);
            }
            return next;
          });
        });
      }
    },
    [],
  );

  const clearLiveEvents = useCallback(() => {
    // Also clear any pending events that haven't been flushed yet
    pendingEventsRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLiveEvents([]);
  }, []);

  // Reset when session changes
  const prevPath = useRef(sessionFilePath);
  if (sessionFilePath !== prevPath.current) {
    prevPath.current = sessionFilePath;
    pendingEventsRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLiveEvents([]);
  }

  return { liveEvents, handleNewEvents, clearLiveEvents };
}
