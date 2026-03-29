import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Components } from "react-markdown";

interface MemoryEditorProps {
  projectHash?: string;
  sessionId?: string;
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
    const isBlock = className?.includes("language-") || className?.includes("hljs") || false;
    if (isBlock) {
      return (
        <code className={`block bg-dt-bg3 p-3.5 rounded-dt border border-dt-border/50 font-mono text-sm overflow-x-auto shadow-dt-sm ${className ?? ""}`}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-dt-bg3 px-1.5 py-0.5 rounded-dt-xs text-dt-accent font-mono text-sm">
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

export function MemoryEditor({ projectHash, sessionId }: MemoryEditorProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!projectHash || !sessionId) return;

    setLoading(true);
    setFetched(false);
    fetch(`/api/sessions/${projectHash}/${sessionId}/memory`)
      .then((r) => r.json())
      .then((data: { content: string | null }) => {
        setContent(data.content);
        setLoading(false);
        setFetched(true);
      })
      .catch(() => {
        setContent(null);
        setLoading(false);
        setFetched(true);
      });
  }, [projectHash, sessionId]);

  if (!projectHash || !sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
        Select a session to view CLAUDE.md
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
        Loading...
      </div>
    );
  }

  if (fetched && content === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-dt-text2 text-sm gap-2 px-4">
        <span className="text-base font-semibold">No CLAUDE.md found</span>
        <span className="text-center">
          Create a CLAUDE.md in your project root to provide context to Claude Code.
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-5 py-4"
      role="region"
      aria-label="CLAUDE.md content"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content ?? ""}
      </ReactMarkdown>
    </div>
  );
}
