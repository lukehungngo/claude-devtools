import { useState, useEffect, useCallback } from "react";
import { Server, Terminal, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react";

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

export function McpManager({ servers: propServers, sessionId }: McpManagerProps): JSX.Element {
  const [servers, setServers] = useState<McpServer[]>(propServers ?? []);
  const [source, setSource] = useState<string>("props");
  const [toggling, setToggling] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);

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

  const isLive = source === "sdk";

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">
      <div className="flex items-center gap-2">
        <Server className="w-5 h-5 text-dt-text1" />
        <h2 className="text-lg font-bold text-dt-text0">MCP Servers</h2>
        {source !== "props" && (
          <span className="text-xxs font-mono px-1.5 py-0.5 rounded bg-dt-bg3 text-dt-text2 ml-auto">
            {isLive ? "live" : "static"}
          </span>
        )}
      </div>

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
              className="flex flex-col gap-2 px-3 py-3 rounded-dt bg-dt-bg2 border border-dt-border"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(server.status)}`}
                  title={server.status}
                />
                <span className="text-sm font-semibold text-dt-text0">{server.name}</span>
                <span className="ml-auto text-xs text-dt-text2">
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
              {/* Toggle and reconnect controls (only when session is available) */}
              {sessionId && (
                <div className="flex items-center gap-2 pt-1">
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
