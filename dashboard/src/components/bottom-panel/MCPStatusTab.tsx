import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Lock, Pause, RefreshCw } from "lucide-react";

/**
 * NEW-4 — MCP server connection status surface.
 *
 * Fetches `GET /api/sessions/:sessionId/mcp-status` which proxies the SDK's
 * `query.mcpServerStatus()`. Renders one row per configured server with a
 * status icon, name, server version, scope, and transport. Failed servers
 * show their error inline. Manual refresh button re-runs the fetch.
 */

type McpStatus = "connected" | "failed" | "needs-auth" | "pending" | "disabled";

interface McpServerConfigShape {
  type?: string;
  url?: string;
}

interface McpServer {
  name: string;
  status: McpStatus;
  serverInfo?: { name?: string; version?: string };
  error?: string;
  config?: McpServerConfigShape;
  scope?: string;
}

interface MCPStatusTabProps {
  /** When omitted, the tab renders the empty state (no fetch fires). */
  sessionId?: string;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; servers: McpServer[] }
  | { kind: "error"; message: string };

export function MCPStatusTab({ sessionId }: MCPStatusTabProps = {}): JSX.Element {
  const [state, setState] = useState<LoadState>(
    sessionId ? { kind: "loading" } : { kind: "idle" },
  );
  const [refreshTick, setRefreshTick] = useState(0);

  const handleRefresh = useCallback(() => {
    if (!sessionId) return;
    setRefreshTick((t) => t + 1);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/mcp-status`);
        if (!res.ok) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: `Failed to load MCP status (${res.status})`,
            });
          }
          return;
        }
        const body = (await res.json()) as { servers?: McpServer[] | null };
        if (cancelled) return;
        const servers = Array.isArray(body.servers) ? body.servers : [];
        setState({ kind: "ready", servers });
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "unknown error";
          setState({ kind: "error", message: `Failed to load MCP status: ${msg}` });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshTick]);

  if (state.kind === "loading") {
    return (
      <div className="p-3 t-mono-sm" style={{ color: "var(--t3)" }}>
        Loading MCP status…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col h-full">
        <Header onRefresh={handleRefresh} disabled={!sessionId} />
        <div className="p-3 t-mono-sm" style={{ color: "var(--red)" }}>
          {state.message}
        </div>
      </div>
    );
  }

  // idle (no sessionId) or ready
  const servers = state.kind === "ready" ? state.servers : [];

  if (servers.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <Header onRefresh={handleRefresh} disabled={!sessionId} />
        <div className="p-3 t-mono-sm" style={{ color: "var(--t3)" }}>
          No MCP servers configured.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header onRefresh={handleRefresh} disabled={!sessionId} />
      <div className="overflow-y-auto flex-1">
        <ul className="t-mono-sm">
          {servers.map((srv) => (
            <ServerRow key={srv.name} server={srv} />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface HeaderProps {
  onRefresh: () => void;
  disabled: boolean;
}

function Header({ onRefresh, disabled }: HeaderProps): JSX.Element {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 t-mono-xs"
      style={{ color: "var(--t3)", borderBottom: "1px solid var(--bd)" }}
    >
      <span>MCP servers</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={disabled}
        aria-label="Refresh MCP status"
        className="flex items-center gap-1 cursor-pointer border-none bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ color: "var(--t3)" }}
        title="Refresh"
      >
        <RefreshCw size={12} />
        <span>Refresh</span>
      </button>
    </div>
  );
}

interface ServerRowProps {
  server: McpServer;
}

function ServerRow({ server }: ServerRowProps): JSX.Element {
  const version = server.serverInfo?.version;
  const transport = formatTransport(server.config);
  const isFailed = server.status === "failed" && Boolean(server.error);
  return (
    <li
      data-testid={`mcp-row-${server.name}`}
      style={{ borderBottom: "1px solid var(--bd)", color: "var(--t1)" }}
      className="px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={server.status} />
        <span className="font-semibold">{server.name}</span>
        {version && (
          <span className="t-mono-xs" style={{ color: "var(--t3)" }}>
            v{version}
          </span>
        )}
        {server.scope && (
          <span
            className="t-mono-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-h)", color: "var(--t2)" }}
          >
            {server.scope}
          </span>
        )}
        {transport && (
          <span className="t-mono-xs ml-auto" style={{ color: "var(--t3)" }}>
            {transport}
          </span>
        )}
      </div>
      {isFailed && (
        <div
          className="t-mono-xs mt-1 pl-6"
          style={{ color: "var(--red)" }}
        >
          {server.error}
        </div>
      )}
    </li>
  );
}

interface StatusIconProps {
  status: McpStatus;
}

function StatusIcon({ status }: StatusIconProps): JSX.Element {
  const size = 14;
  switch (status) {
    case "connected":
      return (
        <span data-testid="mcp-icon-connected" style={{ color: "var(--grn)" }} title="connected">
          <CheckCircle size={size} />
        </span>
      );
    case "failed":
      return (
        <span data-testid="mcp-icon-failed" style={{ color: "var(--red)" }} title="failed">
          <AlertCircle size={size} />
        </span>
      );
    case "pending":
      return (
        <span data-testid="mcp-icon-pending" style={{ color: "var(--amb)" }} title="pending">
          <Clock size={size} />
        </span>
      );
    case "needs-auth":
      return (
        <span data-testid="mcp-icon-needs-auth" style={{ color: "var(--acc)" }} title="needs-auth">
          <Lock size={size} />
        </span>
      );
    case "disabled":
      return (
        <span data-testid="mcp-icon-disabled" style={{ color: "var(--t3)" }} title="disabled">
          <Pause size={size} />
        </span>
      );
    default:
      return (
        <span data-testid="mcp-icon-unknown" style={{ color: "var(--t3)" }} title={status}>
          <AlertCircle size={size} />
        </span>
      );
  }
}

function formatTransport(config?: McpServerConfigShape): string | null {
  if (!config?.type) return null;
  if (config.url) return `${config.type} · ${config.url}`;
  return config.type;
}
