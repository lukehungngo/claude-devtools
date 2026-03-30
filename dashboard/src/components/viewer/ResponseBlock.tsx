import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { markdownComponents } from "../../lib/markdownComponents";

interface ResponseBlockProps {
  text: string;
}

export function ResponseBlock({ text }: ResponseBlockProps) {
  if (!text || !text.trim()) return null;

  // Detect success markers
  const isSuccess =
    text.startsWith("\u2713") ||
    text.startsWith("Done") ||
    text.startsWith("Successfully");

  // Strip leading checkmark to avoid double-rendering (ReactMarkdown also renders it)
  const displayText = isSuccess ? text.replace(/^\u2713\s*/, "") : text;

  return (
    <div className="text-dt-text0 font-mono text-md leading-[1.6] mb-1.5 break-words border-l-2 border-dt-green pl-2">
      {isSuccess && <span className="text-dt-green mr-1">{"\u2713"}</span>}
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
        {displayText}
      </ReactMarkdown>
    </div>
  );
}
