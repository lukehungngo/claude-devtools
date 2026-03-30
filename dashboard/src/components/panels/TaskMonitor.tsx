import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";

interface BackgroundTask {
  id: string;
  name: string;
  progress?: number;
  status: "running" | "completed" | "failed";
  startedAt: number;
  message?: string;
}

interface TaskMonitorProps {
  sessionId?: string;
  events?: Array<{ type: string; [key: string]: unknown }>;
}

export const TaskMonitor = React.memo(function TaskMonitor({ sessionId, events }: TaskMonitorProps) {
  const [tasks, setTasks] = useState<Map<string, BackgroundTask>>(new Map());
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);
  const processedRef = useRef(0);

  // Tick elapsed time every second for running tasks
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Process task events from SSE stream
  useEffect(() => {
    if (!events || events.length <= processedRef.current) return;
    const newEvents = events.slice(processedRef.current);
    processedRef.current = events.length;

    setTasks((prev) => {
      let updated = false;
      const next = new Map(prev);
      for (const evt of newEvents) {
        if (evt.type === "task_started") {
          const id = evt.taskId as string;
          next.set(id, { id, name: (evt.name as string) || "Task", status: "running", startedAt: Date.now() });
          updated = true;
        } else if (evt.type === "task_progress") {
          const id = evt.taskId as string;
          const existing = next.get(id);
          if (existing) {
            next.set(id, { ...existing, progress: evt.progress as number | undefined, message: evt.message as string | undefined });
            updated = true;
          }
        } else if (evt.type === "task_notification") {
          const id = evt.taskId as string;
          const existing = next.get(id);
          if (existing) {
            next.set(id, { ...existing, status: (evt.status as string) === "failed" ? "failed" : "completed", message: evt.message as string | undefined });
            updated = true;
          }
        }
      }
      return updated ? next : prev;
    });
  }, [events]);

  const handleCancel = useCallback(async (taskId: string) => {
    if (!sessionId) return;
    setCancelling((prev) => new Set([...prev, taskId]));
    try {
      await fetch(`/api/sessions/${sessionId}/stop-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
    } catch { /* ignore */ } finally {
      setCancelling((prev) => { const n = new Set(prev); n.delete(taskId); return n; });
    }
  }, [sessionId]);

  const taskList = useMemo(() => Array.from(tasks.values()), [tasks]);
  const running = useMemo(() => taskList.filter((t) => t.status === "running"), [taskList]);
  const done = useMemo(() => taskList.filter((t) => t.status !== "running"), [taskList]);

  const elapsed = useCallback((ms: number) => {
    const s = Math.floor((Date.now() - ms) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      <div className="text-sm font-semibold text-dt-text0 uppercase tracking-wider">
        Background Tasks
      </div>

      {taskList.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-dt-text2 text-sm gap-2">
          <span className="text-2xl opacity-60">⏱</span>
          <span>No background tasks</span>
          <span className="text-xs text-dt-text3">Tasks appear when Claude runs background operations</span>
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-dt-text2 uppercase">Running ({running.length})</div>
              {running.map((t) => (
                <div key={t.id} className="flex flex-col gap-2 p-3 rounded-lg bg-dt-bg3/60 border border-dt-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-dt-accent animate-pulse" />
                      <span className="text-sm font-medium text-dt-text0">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-dt-text2">{elapsed(t.startedAt)}</span>
                      <button
                        onClick={() => handleCancel(t.id)}
                        disabled={cancelling.has(t.id)}
                        className="px-2 py-0.5 text-xs rounded bg-dt-red/20 text-dt-red hover:bg-dt-red/30 disabled:opacity-50 border border-dt-red/30"
                      >
                        {cancelling.has(t.id) ? "..." : "Cancel"}
                      </button>
                    </div>
                  </div>
                  {t.progress != null && (
                    <div className="w-full h-1.5 rounded-full bg-dt-bg4 overflow-hidden">
                      <div className="h-full rounded-full bg-dt-accent transition-all duration-300" style={{ width: `${Math.min(100, t.progress)}%` }} />
                    </div>
                  )}
                  {t.message && <div className="text-xs text-dt-text2 truncate">{t.message}</div>}
                </div>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-dt-text2 uppercase">Completed ({done.length})</div>
              {done.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-dt-bg2/60 border border-dt-border/30">
                  <div className="flex items-center gap-2">
                    <span className={t.status === "failed" ? "text-dt-red" : "text-dt-green"}>
                      {t.status === "failed" ? "✗" : "✓"}
                    </span>
                    <span className="text-sm text-dt-text1">{t.name}</span>
                  </div>
                  {t.message && <span className="text-xs text-dt-text2 truncate max-w-[200px]">{t.message}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});
