import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Save, Loader2, X } from "lucide-react";

type HookType = "command" | "http" | "prompt" | "agent";

interface HookDef {
  type: HookType;
  command?: string;
  url?: string;
  prompt?: string;
  timeout?: number;
}

interface HookMatcher {
  matcher: string;
  hooks: HookDef[];
}

// Legacy flat format for backward compat
interface LegacyHookItem {
  matcher: string;
  command: string;
  description?: string;
}

const EVENT_TYPES = [
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
] as const;

type EventType = typeof EVENT_TYPES[number];

interface HooksData {
  [eventType: string]: HookMatcher[] | LegacyHookItem[];
}

interface HooksResponse {
  hooks: HooksData;
}

/** Normalize legacy flat hooks to the matcher+hooks[] format */
function normalizeHooks(raw: HooksData): Record<string, HookMatcher[]> {
  const result: Record<string, HookMatcher[]> = {};
  for (const [eventType, items] of Object.entries(raw)) {
    if (!Array.isArray(items)) continue;
    result[eventType] = items.map((item) => {
      // Check if it's already in the new format
      if ("hooks" in item && Array.isArray((item as HookMatcher).hooks)) {
        return item as HookMatcher;
      }
      // Legacy format: { matcher, command, description }
      const legacy = item as LegacyHookItem;
      return {
        matcher: legacy.matcher || "",
        hooks: [{ type: "command" as HookType, command: legacy.command }],
      };
    });
  }
  return result;
}

function getHookSummary(hookDef: HookDef): string {
  switch (hookDef.type) {
    case "command":
      return hookDef.command || "(no command)";
    case "http":
      return hookDef.url || "(no url)";
    case "prompt":
    case "agent":
      return hookDef.prompt ? hookDef.prompt.slice(0, 60) : "(no prompt)";
    default:
      return "(unknown type)";
  }
}

interface HookFormProps {
  hookDef: HookDef;
  onChange: (hookDef: HookDef) => void;
  onRemove: () => void;
}

function HookForm({ hookDef, onChange, onRemove }: HookFormProps) {
  return (
    <div className="bg-dt-bg3 rounded-dt p-3 border border-dt-border/50 relative">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 text-dt-text2 hover:text-dt-error transition-colors"
        aria-label="Remove hook definition"
      >
        <X size={14} />
      </button>

      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-dt-text2">Type:</label>
        <select
          value={hookDef.type}
          onChange={(e) => onChange({ ...hookDef, type: e.target.value as HookType })}
          className="bg-dt-bg2 text-dt-text0 text-xs rounded-dt-sm px-2 py-1 border border-dt-border"
          aria-label="Hook type"
        >
          <option value="command">command</option>
          <option value="http">http</option>
          <option value="prompt">prompt</option>
          <option value="agent">agent</option>
        </select>
      </div>

      {(hookDef.type === "command") && (
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-dt-text2 shrink-0">Command:</label>
          <input
            type="text"
            value={hookDef.command ?? ""}
            onChange={(e) => onChange({ ...hookDef, command: e.target.value })}
            className="flex-1 bg-dt-bg2 text-dt-text0 text-xs font-mono rounded-dt-sm px-2 py-1 border border-dt-border"
            placeholder="e.g., check-allowlist.sh"
            aria-label="Hook command"
          />
        </div>
      )}

      {(hookDef.type === "http") && (
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-dt-text2 shrink-0">URL:</label>
          <input
            type="text"
            value={hookDef.url ?? ""}
            onChange={(e) => onChange({ ...hookDef, url: e.target.value })}
            className="flex-1 bg-dt-bg2 text-dt-text0 text-xs font-mono rounded-dt-sm px-2 py-1 border border-dt-border"
            placeholder="e.g., https://example.com/hook"
            aria-label="Hook URL"
          />
        </div>
      )}

      {(hookDef.type === "prompt" || hookDef.type === "agent") && (
        <div className="flex flex-col gap-1 mb-2">
          <label className="text-xs text-dt-text2">Prompt:</label>
          <textarea
            value={hookDef.prompt ?? ""}
            onChange={(e) => onChange({ ...hookDef, prompt: e.target.value })}
            className="bg-dt-bg2 text-dt-text0 text-xs font-mono rounded-dt-sm px-2 py-1 border border-dt-border resize-none h-16"
            placeholder="Enter prompt text..."
            aria-label="Hook prompt"
          />
        </div>
      )}

      {(hookDef.type === "command" || hookDef.type === "http") && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-dt-text2 shrink-0">Timeout (ms):</label>
          <input
            type="number"
            value={hookDef.timeout ?? ""}
            onChange={(e) => onChange({ ...hookDef, timeout: e.target.value ? parseInt(e.target.value, 10) : undefined })}
            className="w-24 bg-dt-bg2 text-dt-text0 text-xs rounded-dt-sm px-2 py-1 border border-dt-border"
            placeholder="10000"
            aria-label="Hook timeout"
          />
        </div>
      )}
    </div>
  );
}

interface MatcherEditorProps {
  matcher: HookMatcher;
  onChange: (matcher: HookMatcher) => void;
  onRemove: () => void;
}

function MatcherEditor({ matcher, onChange, onRemove }: MatcherEditorProps) {
  const [expanded, setExpanded] = useState(false);

  const addHookDef = () => {
    onChange({
      ...matcher,
      hooks: [...matcher.hooks, { type: "command", command: "" }],
    });
    setExpanded(true);
  };

  const updateHookDef = (index: number, hookDef: HookDef) => {
    const newHooks = [...matcher.hooks];
    newHooks[index] = hookDef;
    onChange({ ...matcher, hooks: newHooks });
  };

  const removeHookDef = (index: number) => {
    const newHooks = matcher.hooks.filter((_, i) => i !== index);
    onChange({ ...matcher, hooks: newHooks });
  };

  return (
    <div className="bg-dt-bg2 rounded-dt border border-dt-border shadow-dt-sm transition-all duration-200 hover:shadow-dt-md hover:border-dt-border-active">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(!expanded); }}
      >
        {expanded ? <ChevronDown size={14} className="text-dt-text2" /> : <ChevronRight size={14} className="text-dt-text2" />}
        <span className="text-dt-text0 font-mono text-xs bg-dt-bg3 px-1.5 py-0.5 rounded-dt-xs">
          {matcher.matcher || "*"}
        </span>
        <span className="text-dt-text2 text-xs flex-1 truncate">
          {matcher.hooks.map((h) => getHookSummary(h)).join(", ")}
        </span>
        <span className="text-dt-text2 text-xs bg-dt-bg4 px-1.5 py-px rounded-full">
          {matcher.hooks.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-dt-text2 hover:text-dt-error transition-colors p-1"
          aria-label="Delete hook matcher"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-dt-border/50">
          <div className="flex items-center gap-2 mt-2 mb-2">
            <label className="text-xs text-dt-text2 shrink-0">Matcher:</label>
            <input
              type="text"
              value={matcher.matcher}
              onChange={(e) => onChange({ ...matcher, matcher: e.target.value })}
              className="flex-1 bg-dt-bg3 text-dt-text0 text-xs font-mono rounded-dt-sm px-2 py-1 border border-dt-border"
              placeholder="e.g., Bash, Write, *"
              aria-label="Matcher pattern"
            />
          </div>

          <div className="flex flex-col gap-2 mt-2">
            {matcher.hooks.map((hookDef, i) => (
              <HookForm
                key={i}
                hookDef={hookDef}
                onChange={(hd) => updateHookDef(i, hd)}
                onRemove={() => removeHookDef(i)}
              />
            ))}
          </div>

          <button
            onClick={addHookDef}
            className="flex items-center gap-1 mt-2 text-xs text-dt-accent hover:text-dt-accent/80 transition-colors"
            aria-label="Add hook definition"
          >
            <Plus size={12} />
            Add hook definition
          </button>
        </div>
      )}
    </div>
  );
}

export function HookEditor() {
  const [hooks, setHooks] = useState<Record<string, HookMatcher[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/hooks")
      .then((r) => r.json())
      .then((data: HooksResponse) => {
        const normalized = normalizeHooks(data.hooks);
        setHooks(normalized);
        setExpandedGroups(new Set(Object.keys(normalized)));
        setLoading(false);
      })
      .catch(() => {
        setHooks({});
        setLoading(false);
      });
  }, []);

  const handleSave = useCallback(async () => {
    if (!hooks) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/settings/hooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hooks }),
      });
      const data = await res.json();
      if (data.success) {
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
  }, [hooks]);

  const updateEventType = useCallback((eventType: string, matchers: HookMatcher[]) => {
    setHooks((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (matchers.length === 0) {
        delete next[eventType];
      } else {
        next[eventType] = matchers;
      }
      return next;
    });
    setDirty(true);
  }, []);

  const addMatcher = useCallback((eventType: string) => {
    setHooks((prev) => {
      const next = { ...prev };
      const existing = next[eventType] ?? [];
      next[eventType] = [...existing, { matcher: "", hooks: [{ type: "command", command: "" }] }];
      return next;
    });
    setExpandedGroups((prev) => new Set([...prev, eventType]));
    setDirty(true);
  }, []);

  const removeMatcher = useCallback((eventType: string, index: number) => {
    const key = `${eventType}-${index}`;
    if (confirmDelete !== key) {
      setConfirmDelete(key);
      return;
    }
    setConfirmDelete(null);
    setHooks((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const matchers = [...(next[eventType] ?? [])];
      matchers.splice(index, 1);
      if (matchers.length === 0) {
        delete next[eventType];
      } else {
        next[eventType] = matchers;
      }
      return next;
    });
    setDirty(true);
  }, [confirmDelete]);

  function toggleGroup(groupName: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
        Loading hooks...
      </div>
    );
  }

  const hookEntries = Object.entries(hooks ?? {});

  // Show all event types, even if empty, so users can add hooks to them
  const allEventTypes = new Set([...EVENT_TYPES, ...hookEntries.map(([k]) => k)]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dt-border bg-dt-bg2">
        <span className="text-xs text-dt-text2 flex-1">Hooks Configuration</span>
        {saveStatus && (
          <span className={`text-xs ${saveStatus.startsWith("Error") ? "text-dt-error" : "text-dt-success"}`}>
            {saveStatus}
          </span>
        )}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2 py-1 rounded-dt-sm text-xs font-medium bg-dt-accent text-white hover:bg-dt-accent/80 transition-colors"
            aria-label="Save hooks"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        )}
      </div>

      {/* Hook groups */}
      <div className="flex-1 overflow-y-auto py-3 px-1">
        {[...allEventTypes].map((eventType) => {
          const matchers = hooks?.[eventType] ?? [];
          const isExpanded = expandedGroups.has(eventType);

          return (
            <div key={eventType} className="mb-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleGroup(eventType)}
                  className="flex items-center gap-2 flex-1 px-3 py-2.5 text-left bg-transparent border-none cursor-pointer text-dt-text0 text-sm font-bold uppercase tracking-wider hover:bg-dt-bg3/30 rounded-dt-sm transition-colors duration-100"
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? <ChevronDown size={12} className="text-dt-text2" /> : <ChevronRight size={12} className="text-dt-text2" />}
                  <span>{eventType}</span>
                  {matchers.length > 0 && (
                    <span className="text-dt-text2 text-xs font-normal ml-1 bg-dt-bg4 px-1.5 py-px rounded-full">
                      {matchers.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => addMatcher(eventType)}
                  className="p-1.5 text-dt-text2 hover:text-dt-accent transition-colors rounded-dt-sm hover:bg-dt-bg3/30"
                  aria-label={`Add hook to ${eventType}`}
                  title="Add hook"
                >
                  <Plus size={14} />
                </button>
              </div>

              {isExpanded && matchers.length > 0 && (
                <div className="flex flex-col gap-2 px-3 mt-1">
                  {matchers.map((matcher, i) => (
                    <MatcherEditor
                      key={`${eventType}-${i}`}
                      matcher={matcher}
                      onChange={(updated) => {
                        const newMatchers = [...matchers];
                        newMatchers[i] = updated;
                        updateEventType(eventType, newMatchers);
                      }}
                      onRemove={() => removeMatcher(eventType, i)}
                    />
                  ))}
                </div>
              )}

              {isExpanded && matchers.length === 0 && (
                <div className="px-3 mt-1 text-dt-text2 text-xs italic">
                  No hooks configured for this event.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
