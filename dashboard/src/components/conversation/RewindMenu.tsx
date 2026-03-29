import { useState, useEffect, useCallback, useRef } from "react";
import { X, RotateCcw, FileText, AlertCircle } from "lucide-react";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

interface RewindFilesResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

interface RewindMenuProps {
  turns: TurnSnapshot[];
  sessionId: string;
  onClose: () => void;
  onRewind: (userMessageId: string, dryRun: boolean) => Promise<void>;
  currentTurnNumber?: number;
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function truncatePrompt(prompt: string, maxLen: number = 40): string {
  const firstLine = prompt.split("\n")[0] ?? "";
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen) + "...";
}

/** Extract the user message UUID from the first user event in a turn's events. */
function getUserMessageId(turn: TurnSnapshot): string | null {
  const userEvent = turn.events.find((e) => e.type === "user");
  return userEvent?.uuid ?? null;
}

export function RewindMenu({ turns, sessionId, onClose, onRewind, currentTurnNumber }: RewindMenuProps) {
  const [selectedTurn, setSelectedTurn] = useState<TurnSnapshot | null>(null);
  const [dryRunResult, setDryRunResult] = useState<RewindFilesResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [rewindLoading, setRewindLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap: focus the menu on mount
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  const handleSelectTurn = useCallback(async (turn: TurnSnapshot) => {
    if (turn.turnNumber === currentTurnNumber) return;
    setSelectedTurn(turn);
    setError(null);
    setDryRunResult(null);

    const messageId = getUserMessageId(turn);
    if (!messageId) return;

    // Fetch dry-run preview
    setDryRunLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/rewind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessageId: messageId, dryRun: true }),
      });
      const data: RewindFilesResult = await res.json();
      setDryRunResult(data);
    } catch {
      setDryRunResult(null);
    } finally {
      setDryRunLoading(false);
    }
  }, [sessionId, currentTurnNumber]);

  const handleRewind = useCallback(async () => {
    if (!selectedTurn || rewindLoading) return;
    const messageId = getUserMessageId(selectedTurn);
    if (!messageId) return;

    setRewindLoading(true);
    setError(null);
    try {
      await onRewind(messageId, false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRewindLoading(false);
    }
  }, [selectedTurn, rewindLoading, onRewind, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dt-bg0/80"
      role="dialog"
      aria-modal="true"
      aria-label="Rewind conversation menu"
    >
      <div
        ref={menuRef}
        tabIndex={-1}
        className="bg-dt-bg1 border border-dt-border rounded-dt-md shadow-lg w-full max-w-[700px] max-h-[70vh] flex flex-col outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dt-border">
          <div className="flex items-center gap-2 text-dt-text0 font-semibold text-base">
            <RotateCcw size={16} />
            Rewind Conversation
          </div>
          <button
            onClick={onClose}
            aria-label="Close rewind menu"
            className="text-dt-text2 hover:text-dt-text0 p-1 rounded-dt-xs"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {turns.length === 0 ? (
          <div className="px-4 py-8 text-center text-dt-text2">
            No turns to rewind to
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* Turn list */}
            <div className="w-2/5 border-r border-dt-border overflow-y-auto">
              <div className="px-3 py-2 text-xs text-dt-text2 font-semibold uppercase tracking-wide">
                Turns
              </div>
              {turns.map((turn) => {
                const isDisabled = turn.turnNumber === currentTurnNumber;
                const isSelected = selectedTurn?.turnNumber === turn.turnNumber;
                return (
                  <div
                    key={turn.turnNumber}
                    data-turn={turn.turnNumber}
                    data-disabled={isDisabled ? "true" : undefined}
                    onClick={() => !isDisabled && handleSelectTurn(turn)}
                    className={`
                      px-3 py-2 cursor-pointer text-sm flex items-start gap-2 border-l-2
                      ${isDisabled ? "opacity-40 cursor-not-allowed border-transparent" : ""}
                      ${isSelected ? "border-dt-accent bg-dt-bg2" : "border-transparent hover:bg-dt-bg2"}
                    `}
                  >
                    <span className="text-dt-text2 font-mono text-xs w-5 shrink-0 pt-0.5">
                      {turn.turnNumber}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-dt-text1 truncate">
                        {truncatePrompt(turn.promptText || "(no prompt)")}
                      </div>
                      <div className="text-dt-text2 text-xs flex gap-2">
                        <span>{formatTime(turn.startTime)}</span>
                        {turn.cost != null && (
                          <span>${turn.cost.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action panel */}
            <div className="w-3/5 flex flex-col p-4">
              {selectedTurn ? (
                <>
                  <div className="text-dt-text0 font-semibold mb-1">
                    Rewind to Turn {selectedTurn.turnNumber}
                  </div>
                  <div className="text-dt-text1 text-sm mb-3 truncate">
                    {truncatePrompt(selectedTurn.promptText || "(no prompt)", 60)}
                  </div>

                  {/* Dry-run preview */}
                  <div className="bg-dt-bg2 rounded-dt-xs p-3 mb-4 text-sm flex-1 overflow-y-auto">
                    <div className="text-dt-text2 text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
                      <FileText size={12} />
                      File Changes
                    </div>
                    {dryRunLoading && (
                      <div className="text-dt-text2 text-xs">Calculating file changes...</div>
                    )}
                    {!dryRunLoading && dryRunResult?.filesChanged?.length ? (
                      <ul className="space-y-1" role="list">
                        {dryRunResult.filesChanged.map((f) => (
                          <li key={f} className="text-dt-text1 font-mono text-xs flex items-center gap-1">
                            <span className="text-dt-yellow font-semibold">M</span>
                            {f}
                          </li>
                        ))}
                        {(dryRunResult.insertions != null || dryRunResult.deletions != null) && (
                          <li className="text-dt-text2 text-xs mt-1">
                            +{dryRunResult.insertions ?? 0} / -{dryRunResult.deletions ?? 0}
                          </li>
                        )}
                      </ul>
                    ) : null}
                    {!dryRunLoading && dryRunResult && !dryRunResult.filesChanged?.length && (
                      <div className="text-dt-text2 text-xs">
                        {dryRunResult.error || "No file changes detected"}
                      </div>
                    )}
                    {!dryRunLoading && !dryRunResult && (
                      <div className="text-dt-text2 text-xs">Preview not available</div>
                    )}
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-1 text-dt-red text-xs mb-2">
                      <AlertCircle size={12} />
                      {error}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleRewind}
                      disabled={rewindLoading || dryRunLoading}
                      className="px-3 py-1.5 text-sm font-medium rounded-dt-xs bg-dt-accent text-dt-bg0 hover:opacity-90 disabled:opacity-50"
                    >
                      {rewindLoading ? "Rewinding..." : "Restore code + conversation"}
                    </button>
                    <button
                      onClick={onClose}
                      className="px-3 py-1.5 text-sm font-medium rounded-dt-xs bg-dt-bg3 text-dt-text1 hover:text-dt-text0"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-dt-text2 text-sm">
                  Select a turn to rewind to
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
