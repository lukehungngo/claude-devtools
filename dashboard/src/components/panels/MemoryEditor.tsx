import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Pencil, Eye, Save, Loader2 } from "lucide-react";

import type { Components } from "react-markdown";

interface MemoryEditorProps {
  projectHash?: string;
  sessionId?: string;
}

type EditorMode = "preview" | "edit";

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

/** Determine the file tier label based on the cwd path */
function getFileTier(projectHash?: string): string {
  if (!projectHash) return "unknown";
  // Project-level CLAUDE.md files are in project directories
  // User-level would be in ~/.claude/CLAUDE.md
  // Since we load via session cwd, it's always project-level
  return "project";
}

export function MemoryEditor({ projectHash, sessionId }: MemoryEditorProps) {
  const [content, setContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [mode, setMode] = useState<EditorMode>("preview");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!projectHash || !sessionId) return;

    setLoading(true);
    setFetched(false);
    setMode("preview");
    setSaveStatus(null);
    setDirty(false);
    fetch(`/api/sessions/${projectHash}/${sessionId}/memory`)
      .then((r) => r.json())
      .then((data: { content: string | null }) => {
        setContent(data.content);
        setEditContent(data.content ?? "");
        setLoading(false);
        setFetched(true);
      })
      .catch(() => {
        setContent(null);
        setEditContent("");
        setLoading(false);
        setFetched(true);
      });
  }, [projectHash, sessionId]);

  const handleSave = useCallback(async () => {
    if (!projectHash || !sessionId) return;

    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/sessions/${projectHash}/${sessionId}/memory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      const data = await res.json();
      if (data.success) {
        setContent(editContent);
        setDirty(false);
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(null), 2000);
      } else {
        setSaveStatus(`Error: ${data.error || "Failed to save"}`);
      }
    } catch {
      setSaveStatus("Error: Failed to save");
    } finally {
      setSaving(false);
    }
  }, [projectHash, sessionId, editContent]);

  const handleEditChange = useCallback((value: string) => {
    setEditContent(value);
    setDirty(value !== (content ?? ""));
  }, [content]);

  const switchToEdit = useCallback(() => {
    setMode("edit");
    setEditContent(content ?? "");
    setDirty(false);
  }, [content]);

  const switchToPreview = useCallback(() => {
    setMode("preview");
  }, []);

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

  if (fetched && content === null && mode === "preview") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-dt-text2 text-sm gap-2 px-4">
        <span className="text-base font-semibold">No CLAUDE.md found</span>
        <span className="text-center">
          Create a CLAUDE.md in your project root to provide context to Claude Code.
        </span>
      </div>
    );
  }

  const fileTier = getFileTier(projectHash);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dt-border bg-dt-bg2">
        <span className="text-xs text-dt-text2 bg-dt-bg3 px-1.5 py-0.5 rounded-dt-xs">
          {fileTier}
        </span>
        <span className="text-xs text-dt-text2 flex-1">CLAUDE.md</span>

        {saveStatus && (
          <span className={`text-xs ${saveStatus.startsWith("Error") ? "text-dt-error" : "text-dt-success"}`}>
            {saveStatus}
          </span>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={switchToPreview}
            className={`p-1.5 rounded-dt-sm transition-colors ${mode === "preview" ? "bg-dt-bg4 text-dt-text0" : "text-dt-text2 hover:text-dt-text0 hover:bg-dt-bg3"}`}
            title="Preview"
            aria-label="Preview mode"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={switchToEdit}
            className={`p-1.5 rounded-dt-sm transition-colors ${mode === "edit" ? "bg-dt-bg4 text-dt-text0" : "text-dt-text2 hover:text-dt-text0 hover:bg-dt-bg3"}`}
            title="Edit"
            aria-label="Edit mode"
          >
            <Pencil size={14} />
          </button>
          {mode === "edit" && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`flex items-center gap-1 px-2 py-1 rounded-dt-sm text-xs font-medium transition-colors ${
                dirty
                  ? "bg-dt-accent text-white hover:bg-dt-accent/80"
                  : "bg-dt-bg3 text-dt-text2 cursor-not-allowed"
              }`}
              title="Save"
              aria-label="Save changes"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      {mode === "preview" ? (
        <div
          className="flex-1 overflow-y-auto px-5 py-4"
          role="region"
          aria-label="CLAUDE.md content"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content ?? ""}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          className="flex-1 w-full resize-none bg-dt-bg1 text-dt-text0 font-mono text-sm p-4 outline-none border-none"
          value={editContent}
          onChange={(e) => handleEditChange(e.target.value)}
          placeholder="# CLAUDE.md content..."
          aria-label="CLAUDE.md editor"
          spellCheck={false}
        />
      )}
    </div>
  );
}
