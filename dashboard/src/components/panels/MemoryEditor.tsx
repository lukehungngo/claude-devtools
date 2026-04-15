import { useState, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Pencil, Eye, Save, Loader2 } from "lucide-react";

import { editorMarkdownComponents as markdownComponents } from "../../lib/markdownComponents";

interface MemoryEditorProps {
  projectHash?: string;
  sessionId?: string;
}

interface TierData {
  name: string;
  label: string;
  path: string;
  content: string | null;
}

type EditorMode = "preview" | "edit";

export function MemoryEditor({ projectHash, sessionId }: MemoryEditorProps) {
  const [tiers, setTiers] = useState<TierData[]>([]);
  const [activeTier, setActiveTier] = useState<string>("project");
  const [editContent, setEditContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [mode, setMode] = useState<EditorMode>("preview");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const activeTierData = useMemo(
    () => tiers.find((t) => t.name === activeTier) ?? null,
    [tiers, activeTier],
  );

  const activeContent = activeTierData?.content ?? null;

  useEffect(() => {
    if (!projectHash || !sessionId) return;

    setLoading(true);
    setFetched(false);
    setMode("preview");
    setSaveStatus(null);
    setDirty(false);
    fetch(`/api/sessions/${projectHash}/${sessionId}/memory`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { content: string | null; tiers?: TierData[] }) => {
        const responseTiers = data.tiers ?? [
          { name: "project", label: "Project", path: "", content: data.content },
        ];
        setTiers(responseTiers);

        // Default to first tier with content, or "project"
        const firstWithContent = responseTiers.find((t) => t.content !== null);
        const defaultTier = firstWithContent?.name ?? "project";
        setActiveTier(defaultTier);

        const defaultContent =
          (firstWithContent?.content ?? responseTiers.find((t) => t.name === "project")?.content) ?? null;
        setEditContent(defaultContent ?? "");
        setLoading(false);
        setFetched(true);
      })
      .catch(() => {
        setTiers([]);
        setActiveTier("project");
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
        body: JSON.stringify({ content: editContent, tier: activeTier }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        // Update the tier's content in state
        setTiers((prev) =>
          prev.map((t) => (t.name === activeTier ? { ...t, content: editContent } : t)),
        );
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
  }, [projectHash, sessionId, editContent, activeTier]);

  const handleEditChange = useCallback(
    (value: string) => {
      setEditContent(value);
      setDirty(value !== (activeContent ?? ""));
    },
    [activeContent],
  );

  const switchToEdit = useCallback(() => {
    setMode("edit");
    setEditContent(activeContent ?? "");
    setDirty(false);
  }, [activeContent]);

  const switchToPreview = useCallback(() => {
    setMode("preview");
  }, []);

  const handleTierSwitch = useCallback(
    (tierName: string) => {
      const tier = tiers.find((t) => t.name === tierName);
      setActiveTier(tierName);
      setEditContent(tier?.content ?? "");
      setDirty(false);
      setMode("preview");
      setSaveStatus(null);
    },
    [tiers],
  );

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

  // Show empty state when all tiers have null content
  const allEmpty = tiers.length === 0 || tiers.every((t) => t.content === null);
  if (fetched && allEmpty && mode === "preview") {
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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dt-border bg-dt-bg2">
        {/* Tier tabs */}
        <div className="flex items-center gap-0.5">
          {tiers.map((tier) => (
            <button
              key={tier.name}
              onClick={() => handleTierSwitch(tier.name)}
              className={`px-2 py-1 text-xs rounded-dt-sm transition-colors ${
                activeTier === tier.name
                  ? "bg-dt-bg4 text-dt-text0 font-semibold"
                  : "text-dt-text2 hover:text-dt-text0 hover:bg-dt-bg3"
              }`}
              aria-label={`${tier.label} tier`}
            >
              {tier.label}
            </button>
          ))}
        </div>

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
        activeContent !== null ? (
          <div
            className="flex-1 overflow-y-auto px-5 py-4"
            role="region"
            aria-label="CLAUDE.md content"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {activeContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-dt-text2 text-sm gap-2 px-4">
            <span className="text-center">
              No CLAUDE.md for this tier. Switch to edit mode to create one.
            </span>
          </div>
        )
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
