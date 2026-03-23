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
          sessionId,
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
    <div
      className="conv-input-wrap"
      style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-1)",
        flexShrink: 0,
      }}
    >
      <div
        className="conv-input-box"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "8px 12px",
          transition: "border-color 0.15s",
        }}
      >
        <input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a prompt to Claude Code..."
          disabled={running}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-0)",
            fontFamily: "var(--font)",
            fontSize: "12px",
            caretColor: "var(--accent)",
          }}
        />
        {/* SSE status indicator */}
        {running && sseStatus === "streaming" && (
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--green)",
              animation: "pulse 1.2s ease-in-out infinite",
              flexShrink: 0,
            }}
            title="Streaming response..."
          />
        )}
        {sseStatus === "error" && (
          <span
            style={{
              fontSize: "9px",
              color: "var(--red)",
              fontWeight: 600,
            }}
          >
            Error
          </span>
        )}
        {running ? (
          <button
            onClick={handleStop}
            style={{
              padding: "4px 10px",
              borderRadius: "8px",
              background: "var(--red-dim)",
              border: "none",
              color: "var(--red)",
              fontSize: "10px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {"\u25A0"} Stop
          </button>
        ) : (
          <button
            onClick={submitPrompt}
            disabled={!prompt.trim()}
            style={{
              padding: "4px 10px",
              borderRadius: "8px",
              background: prompt.trim()
                ? "var(--accent)"
                : "var(--bg-3)",
              border: "none",
              color: prompt.trim()
                ? "#fff"
                : "var(--text-2)",
              fontSize: "10px",
              fontWeight: 600,
              cursor: prompt.trim() ? "pointer" : "default",
              transition: "all 0.15s",
            }}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
