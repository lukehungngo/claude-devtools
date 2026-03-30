import type { Components } from "react-markdown";

/**
 * Base markdown component overrides for react-markdown.
 * Uses dt-* design tokens for consistent styling.
 *
 * For code blocks, two variants exist:
 * - "default": minimal styling (p-3 rounded-md)
 * - "editor": richer styling with border and shadow (p-3.5 rounded-dt border shadow)
 *
 * Use createMarkdownComponents("editor") for editor panels like MemoryEditor.
 */
function baseComponents(): Components {
  return {
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
}

type CodeVariant = "default" | "editor";

export function createMarkdownComponents(variant: CodeVariant = "default"): Components {
  const components = baseComponents();

  const blockClass =
    variant === "editor"
      ? "block bg-dt-bg3 p-3.5 rounded-dt border border-dt-border/50 font-mono text-sm overflow-x-auto shadow-dt-sm"
      : "block bg-dt-bg3 p-3 rounded-md font-mono text-sm overflow-x-auto";

  const inlineClass =
    variant === "editor"
      ? "bg-dt-bg3 px-1.5 py-0.5 rounded-dt-xs text-dt-accent font-mono text-sm"
      : "bg-dt-bg3 px-1 py-0.5 rounded text-dt-accent font-mono text-sm";

  components.code = ({ className, children }) => {
    const isBlock = className?.includes("language-") || className?.includes("hljs") || false;
    if (isBlock) {
      return (
        <code className={`${blockClass} ${className ?? ""}`}>
          {children}
        </code>
      );
    }
    return (
      <code className={inlineClass}>
        {children}
      </code>
    );
  };

  return components;
}

/** Default markdown components (viewer style) */
export const markdownComponents: Components = createMarkdownComponents("default");

/** Editor-style markdown components (richer borders/shadows) */
export const editorMarkdownComponents: Components = createMarkdownComponents("editor");
