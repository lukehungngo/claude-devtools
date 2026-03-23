import { useState, useRef, useCallback, useEffect } from "react";
import { isIgnoredStderrWarning } from "../../lib/filterStderrWarnings";

interface PromptInputProps {
  sessionCwd?: string;
  sessionId?: string;
}

export function PromptInput({ sessionCwd, sessionId }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [sseStatus, setSseStatus] = useState<"idle" | "streaming" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const adjustFocus = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!running) adjustFocus();
  }, [running, adjustFocus]);

  async function submitPrompt() {
    if (!prompt.trim() || running) return;

    const currentPrompt = prompt;
    setPrompt("");
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    setSseStatus("streaming");
    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          cwd: sessionCwd,
          sessionId: sessionId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "stderr" && isIgnoredStderrWarning(data.text as string)) {
              continue;
            }
            // Consume SSE events — real-time view shows them via WebSocket
            if (data.type === "result") {
              setSseStatus("idle");
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("Command dispatch error:", err);
        setSseStatus("error");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      // Reset status after a brief delay for error visibility
      setTimeout(() => setSseStatus("idle"), 2000);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div className="conv-input-wrap px-4 pt-2.5 pb-3.5 border-t border-dt-border bg-dt-bg1 shrink-0">
      <div className="conv-input-box flex items-center gap-2 bg-dt-bg2 border border-dt-border rounded-xl px-4 py-3 transition-colors">
        <input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a prompt to Claude Code..."
          disabled={running}
          className="flex-1 bg-transparent border-none outline-none text-dt-text0 font-mono text-lg caret-dt-accent"
        />
        {/* SSE status indicator */}
        {running && sseStatus === "streaming" && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-dt-green animate-pulse-opacity shrink-0"
            title="Streaming response..."
          />
        )}
        {sseStatus === "error" && (
          <span className="text-xs text-dt-red font-semibold">
            Error
          </span>
        )}
        {running ? (
          <button
            onClick={handleStop}
            className="px-2.5 py-1 rounded-dt bg-dt-red-dim border-none text-dt-red text-base font-semibold cursor-pointer"
          >
            {"\u25A0"} Stop
          </button>
        ) : (
          <button
            onClick={submitPrompt}
            disabled={!prompt.trim()}
            className={`px-2.5 py-1 rounded-dt border-none text-base font-semibold transition-all ${
              prompt.trim()
                ? "bg-dt-accent text-white cursor-pointer"
                : "bg-dt-bg3 text-dt-text2 cursor-default"
            }`}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
