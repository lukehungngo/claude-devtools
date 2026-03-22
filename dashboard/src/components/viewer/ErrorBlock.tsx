interface ErrorBlockProps {
  message: string;
}

export function ErrorBlock({ message }: ErrorBlockProps) {
  return (
    <div
      style={{
        color: "var(--red)",
        background: "var(--red-dim)",
        borderRadius: "var(--radius-sm)",
        padding: "8px 10px",
        margin: "6px 0",
        borderLeft: "2px solid var(--red)",
        fontFamily: "var(--font)",
        fontSize: "11px",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {message}
    </div>
  );
}
