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
    <div className="border-l-2 border-dt-accent pl-2 mb-1.5">
      <span className="text-dt-accent text-xs font-semibold font-mono uppercase tracking-wide">Response</span>
      <div className="text-dt-text0 font-mono text-md leading-[1.6] mt-0.5 break-words">
        {isSuccess && <span className="text-dt-green mr-1">{"\u2713"}</span>}
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
          {displayText}
        </ReactMarkdown>
      </div>
    </div>
  );
}, (prev, next) => prev.text === next.text);
