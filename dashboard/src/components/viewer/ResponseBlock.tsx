import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { markdownComponents } from "../../lib/markdownComponents";

interface ResponseBlockProps {
  text: string;
}

export const ResponseBlock = memo(function ResponseBlock({ text }: ResponseBlockProps) {
  if (!text || !text.trim()) return null;

  // Detect success markers
  const isSuccess =
    text.startsWith("\u2713") ||
    text.startsWith("Done") ||
    text.startsWith("Successfully");

  // Strip leading checkmark to avoid double-rendering (ReactMarkdown also renders it)
  const displayText = isSuccess ? text.replace(/^\u2713\s*/, "") : text;

  return (
    <div className="mb-1.5">
      <div className="text-dt-text0 text-[13px] leading-[1.65] break-words">
        {isSuccess && <span className="text-dt-green mr-1">{"\u2713"}</span>}
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
          {displayText}
        </ReactMarkdown>
      </div>
    </div>
  );
}, (prev, next) => prev.text === next.text);
