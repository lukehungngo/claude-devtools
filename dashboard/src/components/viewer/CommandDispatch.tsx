import { useState, useRef, useCallback, useEffect } from "react";

interface CommandDispatchProps {
  sessionCwd?: string;
}

export function CommandDispatch({ sessionCwd }: CommandDispatchProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [lastSentPrompt, setLastSentPrompt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-resize textarea to fit content
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [prompt, adjustHeight]);

  async function submitPrompt() {
    if (!prompt.trim() || running) return;

    const currentPrompt = prompt;
    setPrompt("");
    setLastSentPrompt(currentPrompt);
    setOutput([]);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: planMode ? `[Plan mode] ${currentPrompt}` : currentPrompt,
          cwd: sessionCwd,
        }),
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "stdout" || data.type === "stderr") {
              setOutput((prev) => [...prev, data.text]);
              if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setOutput((prev) => [...prev, "[Aborted]"]);
      } else {
        setOutput((prev) => [
          ...prev,
          `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        ]);
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        margin: "8px 12px",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
        overflow: "hidden",
      }}
    >
      {/* Sent prompt display */}
      {lastSentPrompt && (
        <div
          style={{
            padding: "8px 16px",
            fontFamily: "var(--font)",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--text-1)",
            borderBottom:
              output.length > 0 || running
                ? "1px solid var(--border)"
                : "none",
            display: "flex",
            gap: "8px",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              color: "var(--accent)",
              fontWeight: 700,
              flexShrink: 0,
              lineHeight: 1.5,
            }}
          >
            {"\u276F"}
          </span>
          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {lastSentPrompt}
          </span>
          {running && (
            <span
              style={{
                flexShrink: 0,
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "10px",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--accent)",
                  animation: "pulse 1.2s ease-in-out infinite",
                }}
              />
              Running
            </span>
          )}
        </div>
      )}

      {/* Output area */}
      {output.length > 0 && (
        <div
          ref={outputRef}
          style={{
            maxHeight: "200px",
            overflowY: "auto",
            padding: "8px 16px",
            background: "var(--bg-3)",
            fontFamily: "var(--font)",
            fontSize: "11px",
            lineHeight: 1.6,
            color: "var(--text-1)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {output.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Textarea input */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          padding: "10px 12px",
          borderTop:
            output.length > 0 || lastSentPrompt
              ? "1px solid var(--border)"
              : "none",
        }}
      >
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a prompt to Claude Code..."
          disabled={running}
          rows={1}
          style={{
            flex: 1,
            minHeight: "44px",
            maxHeight: "200px",
            resize: "none",
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            outline: "none",
            color: "var(--text-0)",
            fontFamily: "var(--font)",
            fontSize: "12px",
            lineHeight: 1.5,
            padding: "12px 16px",
            caretColor: "var(--accent)",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        />
        <div
          style={{
            display: "flex",
            gap: "4px",
            alignItems: "center",
            paddingBottom: "4px",
          }}
        >
          <button
            type="button"
            onClick={() => setPlanMode(!planMode)}
            style={{
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
              background: planMode ? "var(--accent-dim)" : "var(--bg-3)",
              border: planMode
                ? "1px solid var(--accent)"
                : "1px solid var(--border)",
              color: planMode ? "var(--accent)" : "var(--text-2)",
              fontSize: "10px",
              cursor: "pointer",
              transition: "all .15s",
            }}
          >
            Plan
          </button>
          {running && (
            <button
              type="button"
              onClick={handleStop}
              style={{
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                color: "var(--red)",
                fontSize: "10px",
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              {"\u25A0"} Stop
            </button>
          )}
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
