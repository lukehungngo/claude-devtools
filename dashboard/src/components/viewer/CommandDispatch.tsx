import { useState, useRef } from "react";

interface CommandDispatchProps {
  sessionCwd?: string;
}

export function CommandDispatch({ sessionCwd }: CommandDispatchProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || running) return;

    const currentPrompt = prompt;
    setPrompt("");
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
      inputRef.current?.focus();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Output area */}
      {output.length > 0 && (
        <div
          ref={outputRef}
          style={{
            maxHeight: "200px",
            overflowY: "auto",
            padding: "8px 16px",
            background: "var(--bg-3)",
            borderTop: "1px solid var(--border)",
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

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-2)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "var(--accent)",
            fontFamily: "var(--font)",
            fontSize: "13px",
            fontWeight: 700,
            userSelect: "none",
          }}
        >
          {"\u276F"}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
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
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
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
          <kbd
            style={{
              padding: "2px 6px",
              borderRadius: "3px",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              fontSize: "10px",
              fontFamily: "var(--font)",
            }}
          >
            {"\u21B5"}
          </kbd>
        </div>
      </form>
    </div>
  );
}
