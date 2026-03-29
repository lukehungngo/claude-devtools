import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Components } from "react-markdown";

interface ResponseBlockProps {
  text: string;
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-dt-text0 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold text-dt-text0 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold text-dt-text0 mb-1">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 text-dt-text0">{children}</p>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-") || false;
    if (isBlock) {
      return (
        <code className="block bg-dt-bg3 p-3 rounded-md font-mono text-sm overflow-x-auto">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-dt-bg3 px-1 py-0.5 rounded text-dt-accent font-mono text-sm">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-2">{children}</pre>,
  ul: ({ children }) => (
    <ul className="pl-4 mb-2 list-disc">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="pl-4 mb-2 list-decimal">{children}</ol>
  ),
  li: ({ children }) => <li className="mb-1">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className="text-dt-accent underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  table: ({ children }) => (
    <table className="border-collapse border border-dt-border mb-2">
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th className="border border-dt-border px-2 py-1 font-bold text-left">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-dt-border px-2 py-1">{children}</td>
  ),
};

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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {displayText}
      </ReactMarkdown>
    </div>
  );
}
