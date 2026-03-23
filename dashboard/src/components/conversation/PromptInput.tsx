import { useState, useRef, useCallback, useEffect } from "react";

interface PromptInputProps {
  sessionCwd?: string;
  sessionId?: string;
}

export function PromptInput({ sessionCwd, sessionId }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [sseStatus, setSseStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [responseText, setResponseText] = useState("");
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
    setResponseText("");

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
        const errBody = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errBody ? ` — ${errBody}` : ""}`);
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

            switch (data.type) {
              case "assistant":
                // Accumulate response text
                if (data.text) {
                  setResponseText((prev) => prev + data.text);
                }
                break;
              case "result":
                setSseStatus("idle");
                break;
              case "done":
                setSseStatus("idle");
                break;
              case "error":
                setSseStatus("error");
                break;
              // Other message types (system, stream) — silently consumed
              // The real-time view picks up events via WebSocket/JSONL watcher
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
      setTimeout(() => {
        setSseStatus("idle");
        setResponseText("");
      }, 5000);
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

  const shortId = sessionId ? sessionId.slice(0, 8) : null;

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
      {/* Forked session indicator */}
      {sessionId && (
        <div
          style={{
            fontSize: "9px",
            color: "var(--text-2)",
            marginBottom: "4px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ color: "var(--yellow)", fontSize: "10px" }}>{"\u26A0"}</span>
          Sends as forked conversation from session {shortId}...
        </div>
      )}

      {/* Response preview */}
      {responseText && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-1)",
            background: "var(--bg-2)",
            borderRadius: "6px",
            padding: "6px 10px",
            marginBottom: "6px",
            maxHeight: "120px",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font)",
            border: "1px solid var(--border)",
          }}
        >
          {responseText.slice(0, 2000)}
          {responseText.length > 2000 && "..."}
        </div>
      )}

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
          placeholder={
            sessionId
              ? `Send to forked session (${shortId}...)...`
              : "Send a prompt to Claude Code..."
          }
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
            title="Streaming response from Claude..."
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
