interface ResponseBlockProps {
  text: string;
}

export function ResponseBlock({ text }: ResponseBlockProps) {
  if (!text || !text.trim()) return null;

  // Detect bullet points and format them
  const lines = text.split("\n");
  const hasBullets = lines.some(
    (l) =>
      l.trimStart().startsWith("- ") ||
      l.trimStart().startsWith("* ") ||
      l.trimStart().match(/^\d+\.\s/),
  );

  // Detect success markers
  const isSuccess =
    text.startsWith("\u2713") ||
    text.startsWith("Done") ||
    text.startsWith("Successfully");

  return (
    <div className="text-dt-text0 font-mono text-md leading-[1.6] mb-1.5 whitespace-pre-wrap break-words border-l-2 border-dt-green pl-2">
      {isSuccess && <span className="text-dt-green mr-1">{"\u2713"}</span>}
      {hasBullets ? (
        lines.map((line, i) => {
          const trimmed = line.trimStart();
          const isBullet =
            trimmed.startsWith("- ") ||
            trimmed.startsWith("* ") ||
            !!trimmed.match(/^\d+\.\s/);

          if (isBullet) {
            // Replace leading - or * with a styled bullet
            const bulletText = trimmed
              .replace(/^[-*]\s/, "")
              .replace(/^\d+\.\s/, "");
            return (
              <div key={i} className="pl-3">
                <span className="text-dt-text1 mr-1">{"\u2022"}</span>
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
