interface ResponseBlockProps {
  text: string;
}

export function ResponseBlock({ text }: ResponseBlockProps) {
  if (!text || !text.trim()) return null;

  // Detect bullet points and format them
  const lines = text.split("\n");
  const hasBullets = lines.some(
    (l) => l.trimStart().startsWith("- ") || l.trimStart().startsWith("* ") || l.trimStart().match(/^\d+\.\s/)
  );

  // Detect success markers
  const isSuccess = text.startsWith("\u2713") || text.startsWith("Done") || text.startsWith("Successfully");

  return (
    <div
      style={{
        color: "var(--text-1)",
        fontFamily: "var(--font)",
        fontSize: "12px",
        lineHeight: 1.6,
        marginBottom: "6px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        borderLeft: "2px solid var(--green)",
        paddingLeft: "8px",
      }}
    >
      {isSuccess && (
        <span style={{ color: "var(--green)", marginRight: "4px" }}>{"\u2713"}</span>
      )}
      {hasBullets ? (
        lines.map((line, i) => {
          const trimmed = line.trimStart();
          const isBullet =
            trimmed.startsWith("- ") ||
            trimmed.startsWith("* ") ||
            !!trimmed.match(/^\d+\.\s/);

          if (isBullet) {
            // Replace leading - or * with a styled bullet
            const bulletText = trimmed.replace(/^[-*]\s/, "").replace(/^\d+\.\s/, "");
            return (
              <div key={i} style={{ paddingLeft: "12px" }}>
                <span style={{ color: "var(--text-2)", marginRight: "4px" }}>{"\u2022"}</span>
                {bulletText}
              </div>
            );
          }
          return <div key={i}>{line}</div>;
        })
      ) : (
        <span>{isSuccess ? text.replace(/^\u2713\s*/, "") : text}</span>
      )}
    </div>
  );
}
