import { useState, useEffect, useCallback } from "react";
import { Server, Terminal, RefreshCw, ToggleLeft, ToggleRight, Plus, Trash2, X } from "lucide-react";

interface McpServer {
  name: string;
  command: string | null;
  args: string[];
  status: "configured" | "connected" | "disconnected" | "error";
  toolCount: number;
  enabled?: boolean;
}

interface McpManagerProps {
  servers?: McpServer[];
  sessionId?: string;
  projectPath?: string;
}

function statusDotClass(status: McpServer["status"]): string {
  switch (status) {
    case "connected":
      return "bg-dt-green";
    case "disconnected":
    case "error":
      return "bg-dt-red";
    default:
      return "bg-dt-yellow";
  }
}

export function McpManager({ servers: propServers, sessionId, projectPath }: McpManagerProps): JSX.Element {
  const [servers, setServers] = useState<McpServer[]>(propServers ?? []);
  const [source, setSource] = useState<string>("props");
  const [toggling, setToggling] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Fetch MCP status from session endpoint if sessionId is provided
  const fetchStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/mcp/status`);
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers ?? []);
        setSource(data.source ?? "unknown");
      }
    } catch {
      // Silently fail — keep existing server list
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      fetchStatus();
    }
  }, [sessionId, fetchStatus]);

  // If propServers changes, sync
  useEffect(() => {
    if (propServers) {
      setServers(propServers);
      setSource("props");
    }
  }, [propServers]);

  async function handleToggle(serverName: string, enabled: boolean): Promise<void> {
    if (!sessionId) return;
    setToggling(serverName);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/mcp/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverName, enabled }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch {
      // Silently fail
    } finally {
      setToggling(null);
    }
  }

  async function handleReconnect(serverName: string): Promise<void> {
    if (!sessionId) return;
    setReconnecting(serverName);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/mcp/reconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverName }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch {
      // Silently fail
    } finally {
      setReconnecting(null);
    }
  }

  // Fetch global server list (for add/remove which use /api/mcp/servers)
  const fetchGlobalServers = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/servers");
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers ?? []);
        setSource("settings");
      }
    } catch {
      // Silently fail
    }
  }, []);

  async function handleAddServer(form: { name: string; command: string; args: string; env: string }): Promise<void> {
    setAddError(null);
    try {
      const args = form.args.trim() ? form.args.split(",").map((a) => a.trim()) : [];
      let env: Record<string, string> | undefined;
      if (form.env.trim()) {
        env = {};
        for (const pair of form.env.split(",")) {
          const [key, ...rest] = pair.split("=");
          if (key?.trim()) {
            env[key.trim()] = rest.join("=").trim();
          }
        }
      }

      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, command: form.command, args, env, projectPath }),
      });

      if (!res.ok) {
        const data = await res.json();
        setAddError(data.error ?? "Failed to add server");
        return;
      }

      setShowAddForm(false);
      // Refetch
      if (sessionId) {
        await fetchStatus();
      } else {
        await fetchGlobalServers();
      }
    } catch {
      setAddError("Failed to add server");
    }
  }

  async function handleRemoveServer(name: string): Promise<void> {
    try {
      const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath }),
      });

      if (res.ok) {
        setConfirmRemove(null);
        // Refetch
        if (sessionId) {
          await fetchStatus();
        } else {
          await fetchGlobalServers();
        }
      }
    } catch {
      // Silently fail
    }
  }

  const isLive = source === "sdk";

  return (
    <div className="flex flex-col h-full overflow-auto p-5 gap-4">
      <div className="flex items-center gap-2.5">
        <Server className="w-5 h-5 text-dt-text1" />
        <h2 className="text-lg font-semibold text-dt-text0 font-sans tracking-[-0.3px]">MCP Servers</h2>
        {source !== "props" && (
          <span className={`text-xxs font-mono px-2 py-0.5 rounded-full ${isLive ? "bg-dt-green-dim text-dt-green" : "bg-dt-bg3 text-dt-text2"}`}>
            {isLive ? "live" : "static"}
          </span>
        )}
        <button
          onClick={() => { setShowAddForm(true); setAddError(null); }}
          aria-label="Add MCP server"
          className="ml-auto flex items-center gap-1 text-xs text-dt-accent hover:text-dt-text0 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Add Server
        </button>
      </div>

      {/* Add Server Form */}
      {showAddForm && (
        <AddServerForm
          onSubmit={handleAddServer}
          onCancel={() => setShowAddForm(false)}
          error={addError}
        />
      )}

      {servers.length === 0 ? (
        <div className="text-sm text-dt-text2">
          No MCP servers configured. Add servers to{" "}
          <code className="text-xs bg-dt-bg3 px-1 py-0.5 rounded text-dt-accent font-mono">
            ~/.claude/settings.json
          </code>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {servers.map((server) => (
            <div
              key={server.name}
              className="flex flex-col gap-2.5 px-4 py-3.5 rounded-dt-md bg-dt-bg2 border border-dt-border shadow-dt-sm transition-all duration-200 hover:shadow-dt-md hover:border-dt-border-active"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(server.status)} ${server.status === "connected" ? "shadow-[0_0_6px_var(--green)]" : ""}`}
                  title={server.status}
                />
                <span className="text-sm font-semibold text-dt-text0">{server.name}</span>
                <span className="ml-auto text-xs text-dt-text2 bg-dt-bg3 px-1.5 py-0.5 rounded-full">
                  {server.toolCount} tools
                </span>
              </div>
              {server.command && (
                <div className="flex items-center gap-1.5 text-xs text-dt-text2 font-mono">
                  <Terminal className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {server.command}{server.args.length > 0 ? ` ${server.args.join(" ")}` : ""}
                  </span>
                </div>
              )}
              {/* Controls row */}
              <div className="flex items-center gap-2 pt-1">
                {/* Toggle and reconnect controls (only when session is available) */}
                {sessionId && (
                  <>
                    {isLive ? (
                      <>
                        <button
                          onClick={() => handleToggle(server.name, server.enabled === false)}
                          disabled={toggling === server.name}
                          aria-label={`Toggle ${server.name} ${server.enabled !== false ? "off" : "on"}`}
                          className="flex items-center gap-1 text-xs text-dt-text2 hover:text-dt-text0 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {server.enabled !== false ? (
                            <ToggleRight size={16} className="text-dt-green" />
                          ) : (
                            <ToggleLeft size={16} className="text-dt-text2" />
                          )}
                          {server.enabled !== false ? "Enabled" : "Disabled"}
                        </button>
                        <button
                          onClick={() => handleReconnect(server.name)}
                          disabled={reconnecting === server.name}
                          aria-label={`Reconnect ${server.name}`}
                          className="flex items-center gap-1 text-xs text-dt-text2 hover:text-dt-text0 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw
                            size={12}
                            className={reconnecting === server.name ? "animate-spin" : ""}
                          />
                          Reconnect
                        </button>
                      </>
                    ) : (
                      <span className="text-xxs text-dt-text2 italic">
                        Active session required for toggle/reconnect
                      </span>
                    )}
                  </>
                )}
                {/* Remove button */}
                {confirmRemove === server.name ? (
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="text-xxs text-dt-red">Remove?</span>
                    <button
                      onClick={() => handleRemoveServer(server.name)}
                      aria-label={`Confirm remove ${server.name}`}
                      className="text-xxs text-dt-red hover:text-dt-text0 cursor-pointer font-semibold"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmRemove(null)}
                      aria-label="Cancel remove"
                      className="text-xxs text-dt-text2 hover:text-dt-text0 cursor-pointer"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmRemove(server.name)}
                    aria-label={`Remove ${server.name}`}
                    className="ml-auto flex items-center gap-1 text-xs text-dt-text2 hover:text-dt-red transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Add Server Form ---

interface AddServerFormProps {
  onSubmit: (form: { name: string; command: string; args: string; env: string }) => void;
  onCancel: () => void;
  error: string | null;
}

function AddServerForm({ onSubmit, onCancel, error }: AddServerFormProps): JSX.Element {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    onSubmit({ name: name.trim(), command: command.trim(), args, env });
  }

  const inputClass =
    "w-full px-3 py-2 text-sm bg-dt-bg1 border border-dt-border rounded-dt-md text-dt-text0 placeholder:text-dt-text2 focus:outline-none focus:border-dt-accent font-mono";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 rounded-dt-md bg-dt-bg2 border border-dt-accent/30">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-dt-text0">Add MCP Server</span>
        <button type="button" onClick={onCancel} aria-label="Cancel add server" className="text-dt-text2 hover:text-dt-text0 cursor-pointer">
          <X size={14} />
        </button>
      </div>
      <input
        type="text"
        placeholder="Server name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        aria-label="Server name"
        className={inputClass}
      />
      <input
        type="text"
        placeholder="Command (e.g., npx)"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        required
        aria-label="Command"
        className={inputClass}
      />
      <input
        type="text"
        placeholder="Args (comma-separated, e.g., -y, @mcp/fs)"
        value={args}
        onChange={(e) => setArgs(e.target.value)}
        aria-label="Arguments"
        className={inputClass}
      />
      <input
        type="text"
        placeholder="Env vars (KEY=VALUE, comma-separated)"
        value={env}
        onChange={(e) => setEnv(e.target.value)}
        aria-label="Environment variables"
        className={inputClass}
      />
      {error && <p className="text-xs text-dt-red">{error}</p>}
      <button
        type="submit"
        disabled={!name.trim() || !command.trim()}
        className="px-4 py-2 text-sm font-semibold bg-dt-accent text-dt-bg0 rounded-dt-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add Server
      </button>
    </form>
  );
}
