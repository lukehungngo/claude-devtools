import { useState, useEffect, useCallback } from "react";
import { X, Plus } from "lucide-react";

interface PermissionsData {
  allow: string[];
  deny: string[];
  ask: string[];
}

type RuleCategory = "allow" | "deny" | "ask";

interface RuleColumnProps {
  title: string;
  category: RuleCategory;
  rules: string[];
  onAdd: (category: RuleCategory, rule: string) => void;
  onRemove: (category: RuleCategory, index: number) => void;
}

function RuleColumn({ title, category, rules, onAdd, onRemove }: RuleColumnProps) {
  const [inputValue, setInputValue] = useState("");

  function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onAdd(category, trimmed);
    setInputValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  const borderColor =
    category === "allow"
      ? "border-dt-green/30"
      : category === "deny"
      ? "border-dt-red/30"
      : "border-dt-yellow/30";

  const pillBg =
    category === "allow"
      ? "bg-dt-green/15 text-dt-green"
      : category === "deny"
      ? "bg-dt-red/15 text-dt-red"
      : "bg-dt-yellow/15 text-dt-yellow";

  return (
    <div className={`flex flex-col border ${borderColor} rounded-dt p-3`}>
      <h4 className="text-xs font-bold uppercase tracking-wider text-dt-text2 mb-2">
        {title}
      </h4>

      {/* Rules list */}
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
        {rules.map((rule, idx) => (
          <span
            key={`${rule}-${idx}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono ${pillBg}`}
          >
            {rule}
            <button
              onClick={() => onRemove(category, idx)}
              aria-label={`Remove rule ${rule}`}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-dt-bg4 cursor-pointer bg-transparent border-none p-0"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      {/* Add rule input */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ToolName(pattern)"
          className="flex-1 bg-dt-bg3 border border-dt-border rounded-dt-sm px-2 py-1 text-xs font-mono text-dt-text0 placeholder:text-dt-text3 outline-none focus:border-dt-accent"
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 px-2 py-1 rounded-dt-sm bg-dt-accent/20 text-dt-accent text-xs font-semibold hover:bg-dt-accent/30 cursor-pointer border-none transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>
    </div>
  );
}

export function PermissionRulesEditor() {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/permissions")
      .then((r) => r.json())
      .then((d: PermissionsData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData({ allow: [], deny: [], ask: [] });
        setLoading(false);
      });
  }, []);

  const persist = useCallback(async (updated: PermissionsData) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleAdd = useCallback(
    (category: RuleCategory, rule: string) => {
      if (!data) return;
      const updated = {
        ...data,
        [category]: [...data[category], rule],
      };
      setData(updated);
      persist(updated);
    },
    [data, persist],
  );

  const handleRemove = useCallback(
    (category: RuleCategory, index: number) => {
      if (!data) return;
      const updated = {
        ...data,
        [category]: data[category].filter((_, i) => i !== index),
      };
      setData(updated);
      persist(updated);
    },
    [data, persist],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
        Loading permissions...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto h-full p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-dt-text0">Permission Rules</h3>
        {saving && (
          <span className="text-xs text-dt-text2">Saving...</span>
        )}
      </div>
      <p className="text-xs text-dt-text2 -mt-2 mb-1">
        Rules use the format <code className="font-mono bg-dt-bg3 px-1 rounded">ToolName(pattern)</code> — e.g., <code className="font-mono bg-dt-bg3 px-1 rounded">Read(*)</code>, <code className="font-mono bg-dt-bg3 px-1 rounded">Bash(npm test)</code>
      </p>

      {error && (
        <div className="text-xs text-dt-red bg-dt-red/10 border border-dt-red/30 rounded-dt-sm px-3 py-2">
          {error}
        </div>
      )}

      <RuleColumn
        title="Allow"
        category="allow"
        rules={data?.allow ?? []}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />
      <RuleColumn
        title="Deny"
        category="deny"
        rules={data?.deny ?? []}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />
      <RuleColumn
        title="Ask"
        category="ask"
        rules={data?.ask ?? []}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />
    </div>
  );
}
