import { useEffect, useState, useCallback } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";

interface DryRunResponse {
  files: string[];
  rawStdout: string;
  rawStderr: string;
  exitCode: number;
}

interface PurgeResponse {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface Props {
  projectHash: string;
  projectName: string;
  onClose: () => void;
  onPurged: () => void;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; files: string[]; rawStdout: string }
  | { kind: "error"; message: string }
  | { kind: "purging" }
  | { kind: "failed"; message: string };

export function PurgeConfirmModal({ projectHash, projectName, onClose, onPurged }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectHash)}/purge/dry-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (cancelled) return;
          setState({ kind: "error", message: body.error ?? `Dry-run failed (${res.status})` });
          return;
        }
        const data = (await res.json()) as DryRunResponse;
        if (cancelled) return;
        setState({ kind: "ready", files: data.files, rawStdout: data.rawStdout });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Network error";
        setState({ kind: "error", message: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectHash]);

  const handleConfirm = useCallback(async () => {
    setState({ kind: "purging" });
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectHash)}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = (await res.json().catch(() => ({}))) as PurgeResponse;
      if (!res.ok || !data.ok) {
        setState({
          kind: "failed",
          message: data.stderr || `Purge failed (exit ${data.exitCode ?? "?"})`,
        });
        return;
      }
      onPurged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setState({ kind: "failed", message: msg });
    }
  }, [projectHash, onPurged]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const fileCount = state.kind === "ready" ? state.files.length : 0;
  const checkboxLabel =
    fileCount === 1
      ? "I understand this deletes 1 file"
      : `I understand this deletes ${fileCount} files`;

  return (
    <div
      data-testid="purge-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        data-testid="purge-modal-content"
        className="flex flex-col bg-dt-bg-panel border border-dt-border rounded-lg shadow-xl w-[90vw] max-w-[640px] max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-dt-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-dt-text">
            <AlertTriangle size={14} className="text-dt-amber" />
            <span>Purge project: {projectName}</span>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded text-dt-text3 hover:text-dt-text hover:bg-dt-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-sm text-dt-text2">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading dry-run preview...</span>
            </div>
          )}

          {state.kind === "error" && (
            <div className="text-sm text-dt-red">
              {state.message}
            </div>
          )}

          {state.kind === "ready" && (
            <>
              <p className="text-xs text-dt-text2">
                The following files would be deleted by{" "}
                <code className="font-mono text-dt-text">claude project purge</code>:
              </p>
              <div
                data-testid="purge-file-list"
                className="flex-1 overflow-y-auto font-mono text-xs border border-dt-border rounded p-2 bg-dt-bg max-h-[300px]"
              >
                {state.files.length === 0 ? (
                  <div className="text-dt-text3 italic">
                    No files to purge. (Raw output below for reference.)
                    <pre className="mt-2 text-[10px] whitespace-pre-wrap">{state.rawStdout}</pre>
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {state.files.map((f) => (
                      <li key={f} className="text-dt-text">{f}</li>
                    ))}
                  </ul>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-dt-text2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  aria-label={checkboxLabel}
                />
                <span>{checkboxLabel}</span>
              </label>
            </>
          )}

          {state.kind === "purging" && (
            <div className="flex items-center gap-2 text-sm text-dt-text2">
              <Loader2 size={14} className="animate-spin" />
              <span>Purging...</span>
            </div>
          )}

          {state.kind === "failed" && (
            <div className="text-sm text-dt-red">
              Purge failed: {state.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 shrink-0 px-4 py-3 border-t border-dt-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-dt-border text-dt-text2 hover:bg-dt-bg-hover transition-colors"
          >
            Cancel
          </button>
          {state.kind === "ready" && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!acknowledged || state.files.length === 0}
              className="px-3 py-1.5 text-xs rounded bg-dt-red text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              Yes, purge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
