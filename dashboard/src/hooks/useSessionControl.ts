import { useState, useCallback, useRef, useEffect } from "react";
import type { EffortLevel } from "../lib/types";

const API_BASE = "/api";

interface UseSessionControlReturn {
  model: string | null;
  fastMode: boolean;
  effort: EffortLevel;
  setModel: (model: string) => Promise<void>;
  toggleFastMode: () => Promise<void>;
  setEffort: (effort: EffortLevel) => Promise<void>;
  sendCompact: () => Promise<void>;
}

export function useSessionControl(
  sessionId: string | null
): UseSessionControlReturn {
  const [model, setModelState] = useState<string | null>(null);
  const [fastMode, setFastModeState] = useState(false);
  const [effort, setEffortState] = useState<EffortLevel>("high");

  // Reset state and seed model from server when session changes
  useEffect(() => {
    setModelState(null);
    setFastModeState(false);
    setEffortState("high");

    if (!sessionId) return;

    let cancelled = false;

    fetch(`${API_BASE}/sessions/${sessionId}/model`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { model: string | null } | null) => {
        if (!cancelled && data?.model) {
          setModelState(data.model);
        }
      })
      .catch(() => {
        // Server unavailable or session not found — leave model as null
      });

    return () => { cancelled = true; };
  }, [sessionId]);

  // Use ref for fastMode in toggleFastMode to read current value inside useCallback
  // without adding fastMode to the dependency array (which would break ref stability).
  const fastModeRef = useRef(fastMode);
  fastModeRef.current = fastMode;

  const postJson = useCallback(
    async (path: string, body: Record<string, unknown>): Promise<boolean> => {
      if (!sessionId) return false;
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [sessionId]
  );

  const setModel = useCallback(
    async (newModel: string): Promise<void> => {
      if (!sessionId) return;
      const ok = await postJson("model", { model: newModel });
      if (ok) {
        setModelState(newModel);
      }
    },
    [sessionId, postJson]
  );

  const toggleFastMode = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    const newValue = !fastModeRef.current;
    const ok = await postJson("fast", { enabled: newValue });
    if (ok) {
      setFastModeState(newValue);
    }
  }, [sessionId, postJson]);

  const setEffort = useCallback(
    async (newEffort: EffortLevel): Promise<void> => {
      if (!sessionId) return;
      const ok = await postJson("effort", { level: newEffort });
      if (ok) {
        setEffortState(newEffort);
      }
    },
    [sessionId, postJson]
  );

  const sendCompact = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await postJson("message", { message: "/compact" });
  }, [sessionId, postJson]);

  return {
    model,
    fastMode,
    effort,
    setModel,
    toggleFastMode,
    setEffort,
    sendCompact,
  };
}
