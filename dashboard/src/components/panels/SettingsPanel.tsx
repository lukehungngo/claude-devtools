import { useState, useEffect, useCallback } from "react";
import { Save, Plus, X } from "lucide-react";
import type { SessionMetrics, UsageInfo } from "../../lib/types";

interface SettingsPanelProps {
  metrics: SessionMetrics | null;
  usage: UsageInfo | null;
}

interface SettingRowProps {
  label: string;
  value: string | number | null | undefined;
}

function SettingRow({ label, value }: SettingRowProps) {
  return (
    <div className="flex justify-between items-center py-2 px-4 hover:bg-dt-bg3/30 transition-colors duration-100 rounded-dt-xs mx-1">
      <span className="text-dt-text2 text-sm">{label}</span>
      <span className="text-dt-text0 font-mono text-sm">
        {value ?? "--"}
      </span>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <h3 className="text-xs font-bold text-dt-text2 uppercase tracking-wider px-4 pt-4 pb-1.5 border-b border-dt-border/30 mx-1 mb-1">
      {title}
    </h3>
  );
}

// --- Editable Settings Types ---

interface SettingsData {
  model?: string;
  effort?: string;
  permissionMode?: string;
  env?: Record<string, string>;
}

const EFFORT_OPTIONS = ["low", "medium", "high", "max"];
const PERMISSION_MODE_OPTIONS = [
  "default",
  "plan",
  "bypassPermissions",
  "allowEdits",
  "allowAll",
  "deny",
];

const FALLBACK_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

interface EditableSettingsProps {
  sessionId?: string;
}

function EditableSettings({ sessionId }: EditableSettingsProps) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);

  // New env entry state
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsData) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => {
        setSettings({});
        setLoading(false);
      });

    // Try to load discovery models
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/models`)
        .then((r) => r.json())
        .then((data: { models: Array<{ value: string }> }) => {
          if (data.models?.length) {
            setModels(data.models.map((m) => m.value));
          }
        })
        .catch(() => {});
    }
  }, [sessionId]);

  const handleSave = useCallback(async () => {
    if (!settings || !dirty) return;
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {};
    if (settings.model) body.model = settings.model;
    if (settings.effort) body.effort = settings.effort;
    if (settings.permissionMode) body.permissionMode = settings.permissionMode;
    if (settings.env && Object.keys(settings.env).length > 0) body.env = settings.env;

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to save");
      } else {
        setDirty(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [settings, dirty]);

  const updateField = useCallback(
    <K extends keyof SettingsData>(field: K, value: SettingsData[K]) => {
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
      setDirty(true);
    },
    [],
  );

  const addEnvVar = useCallback(() => {
    const key = newEnvKey.trim();
    if (!key) return;
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, env: { ...(prev.env ?? {}), [key]: newEnvValue } };
    });
    setDirty(true);
    setNewEnvKey("");
    setNewEnvValue("");
  }, [newEnvKey, newEnvValue]);

  const removeEnvVar = useCallback((key: string) => {
    setSettings((prev) => {
      if (!prev?.env) return prev;
      const next = { ...prev.env };
      delete next[key];
      return { ...prev, env: next };
    });
    setDirty(true);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-dt-text2 text-sm">
        Loading settings...
      </div>
    );
  }

  const env = settings?.env ?? {};

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader title="User Settings" />

      {error && (
        <div className="text-xs text-dt-red bg-dt-red/10 border border-dt-red/30 rounded-dt-sm px-3 py-2 mx-4">
          {error}
        </div>
      )}

      {/* Model */}
      <div className="flex justify-between items-center py-2 px-4 mx-1">
        <span className="text-dt-text2 text-sm">Model</span>
        <select
          value={settings?.model ?? ""}
          onChange={(e) => updateField("model", e.target.value)}
          aria-label="Model"
          className="bg-dt-bg3 border border-dt-border rounded-dt-sm px-2 py-1 text-xs font-mono text-dt-text0 outline-none focus:border-dt-accent"
        >
          <option value="">-- select --</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Effort */}
      <div className="flex justify-between items-center py-2 px-4 mx-1">
        <span className="text-dt-text2 text-sm">Effort</span>
        <select
          value={settings?.effort ?? ""}
          onChange={(e) => updateField("effort", e.target.value)}
          aria-label="Effort"
          className="bg-dt-bg3 border border-dt-border rounded-dt-sm px-2 py-1 text-xs font-mono text-dt-text0 outline-none focus:border-dt-accent"
        >
          <option value="">-- select --</option>
          {EFFORT_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* Permission Mode */}
      <div className="flex justify-between items-center py-2 px-4 mx-1">
        <span className="text-dt-text2 text-sm">Permission Mode</span>
        <select
          value={settings?.permissionMode ?? ""}
          onChange={(e) => updateField("permissionMode", e.target.value)}
          aria-label="Permission Mode"
          className="bg-dt-bg3 border border-dt-border rounded-dt-sm px-2 py-1 text-xs font-mono text-dt-text0 outline-none focus:border-dt-accent"
        >
          <option value="">-- select --</option>
          {PERMISSION_MODE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* Environment Variables */}
      <SectionHeader title="Environment Variables" />
      <div className="flex flex-col gap-1.5 px-4 mx-1">
        {Object.entries(env).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs font-mono text-dt-text2 min-w-[80px]">{key}</span>
            <span className="text-xs font-mono text-dt-text0 flex-1 truncate">{value}</span>
            <button
              onClick={() => removeEnvVar(key)}
              aria-label={`Remove ${key}`}
              className="p-0.5 rounded hover:bg-dt-bg4 cursor-pointer bg-transparent border-none text-dt-text2"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5 mt-1">
          <input
            type="text"
            value={newEnvKey}
            onChange={(e) => setNewEnvKey(e.target.value)}
            placeholder="KEY"
            aria-label="New env key"
            className="w-24 bg-dt-bg3 border border-dt-border rounded-dt-sm px-2 py-1 text-xs font-mono text-dt-text0 placeholder:text-dt-text3 outline-none focus:border-dt-accent"
          />
          <input
            type="text"
            value={newEnvValue}
            onChange={(e) => setNewEnvValue(e.target.value)}
            placeholder="value"
            aria-label="New env value"
            className="flex-1 bg-dt-bg3 border border-dt-border rounded-dt-sm px-2 py-1 text-xs font-mono text-dt-text0 placeholder:text-dt-text3 outline-none focus:border-dt-accent"
          />
          <button
            onClick={addEnvVar}
            className="flex items-center gap-1 px-2 py-1 rounded-dt-sm bg-dt-accent/20 text-dt-accent text-xs font-semibold hover:bg-dt-accent/30 cursor-pointer border-none transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 mx-1 mt-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-dt-md text-sm font-semibold transition-all cursor-pointer border-none ${
            dirty
              ? "bg-dt-accent text-dt-bg0 hover:bg-dt-accent/80 shadow-dt-sm"
              : "bg-dt-bg3 text-dt-text3 cursor-not-allowed"
          }`}
        >
          <Save size={14} />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel({ metrics, usage }: SettingsPanelProps) {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
        Select a session to view settings
      </div>
    );
  }

  const model = metrics.models.length > 0 ? metrics.models[0] : null;
  const permissionMode = metrics.permissionMode ?? metrics.session.permissionMode ?? null;
  const cwd = metrics.session.cwd ?? null;
  const gitBranch = metrics.session.gitBranch ?? null;
  const contextPercent = metrics.contextPercent;
  const repoConfig = metrics.repoConfig;

  return (
    <div className="flex flex-col overflow-y-auto h-full py-2">
      <SectionHeader title="Session" />
      <SettingRow label="Model" value={model} />
      <SettingRow label="Permission Mode" value={permissionMode} />
      <SettingRow label="Working Directory" value={cwd} />
      <SettingRow label="Git Branch" value={gitBranch} />
      <div className="flex justify-between items-center py-2 px-4 mx-1">
        <span className="text-dt-text2 text-sm">Context Window</span>
        <div className="flex items-center gap-2.5">
          <div className="w-24 h-1.5 bg-dt-bg3 rounded-full overflow-hidden">
            <div
              className="h-full bg-dt-accent rounded-full transition-all duration-300"
              style={{ width: `${Math.min(contextPercent, 100)}%` }}
            />
          </div>
          <span className="text-dt-text0 font-mono text-sm">{contextPercent}%</span>
        </div>
      </div>

      <SectionHeader title="Configuration" />
      <SettingRow label="CLAUDE.md Files" value={repoConfig?.claudeMdFiles ?? "--"} />
      <SettingRow label="Rules" value={repoConfig?.rules ?? "--"} />
      <SettingRow label="Agents" value={repoConfig?.agents ?? "--"} />
      <SettingRow label="Hooks" value={repoConfig?.hooks ?? "--"} />

      {usage && (
        <>
          <SectionHeader title="API Key" />
          <SettingRow label="Plan" value={usage.planName} />
          {usage.fiveHour.utilization != null && (
            <div className="flex justify-between items-center py-2 px-4 mx-1">
              <span className="text-dt-text2 text-sm">Session Utilization</span>
              <div className="flex items-center gap-2.5">
                <div className="w-24 h-1.5 bg-dt-bg3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-dt-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(usage.fiveHour.utilization * 100, 100)}%` }}
                  />
                </div>
                <span className="text-dt-text0 font-mono text-sm">
                  {Math.round(usage.fiveHour.utilization * 100)}%
                </span>
              </div>
            </div>
          )}
          {usage.sevenDay.utilization != null && (
            <div className="flex justify-between items-center py-2 px-4 mx-1">
              <span className="text-dt-text2 text-sm">Weekly Utilization</span>
              <div className="flex items-center gap-2.5">
                <div className="w-24 h-1.5 bg-dt-bg3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-dt-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(usage.sevenDay.utilization * 100, 100)}%` }}
                  />
                </div>
                <span className="text-dt-text0 font-mono text-sm">
                  {Math.round(usage.sevenDay.utilization * 100)}%
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Editable user-level settings */}
      <EditableSettings sessionId={metrics.session.id} />
    </div>
  );
}
