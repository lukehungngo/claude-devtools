import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Lock, Pause, RefreshCw, Settings } from "lucide-react";
import type { SessionEvent } from "../../lib/types";
import { type TurnSnapshot, getEventsForTurn } from "../../lib/turnSnapshot";

/**
 * NEW-4 — MCP server connection status surface.
 *
 * Fetches `GET /api/sessions/:sessionId/mcp-status` which proxies the SDK's
 * `query.mcpServerStatus()`. Renders one row per configured server with a
 * status icon, name, server version, scope, and transport. Failed servers
 * show their error inline. Manual refresh button re-runs the fetch.
 */

/**
 * `"configured"` is Bug F's cold-session fallback status — the dashboard
 * fetched config from disk because the session has no live SDK query.
 */
type McpStatus = "connected" | "failed" | "needs-auth" | "pending" | "disabled" | "configured";

interface McpServerConfigShape {
  type?: string;
  url?: string;
  command?: string;
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
  /**
   * Bug I — per-turn MCP tool usage. When supplied with `turns` and a non-null
   * `activeTurnIndex`, the tab renders a SEPARATE section below the server
   * list listing `mcp__server__tool` calls fired in that turn. Server status
   * itself is session-scoped (one row per configured server) so the per-turn
   * surface is additive, not a replacement.
   */
  events?: SessionEvent[];
  turns?: TurnSnapshot[];
  activeTurnIndex?: number | null;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; servers: McpServer[] }
  | { kind: "error"; message: string };

/**
 * Bug I — per-turn MCP tool-call summary derived from a turn's assistant
 * events. `byTool` is a multiset of distinct mcp tool names → call counts.
 */
interface McpToolCallSummary {
  serverName: string;
  totalCalls: number;
  byTool: Map<string, number>;
}

export function MCPStatusTab({
  sessionId,
  events = [],
  turns = [],
  activeTurnIndex = null,
}: MCPStatusTabProps = {}): JSX.Element {
  const [state, setState] = useState<LoadState>(
    sessionId ? { kind: "loading" } : { kind: "idle" },
  );
  const [refreshTick, setRefreshTick] = useState(0);

  const handleRefresh = useCallback(() => {
    if (!sessionId) return;
    setRefreshTick((t) => t + 1);
  }, [sessionId]);

  // Bug I — derive per-turn MCP tool-call summary. Walks ONLY the active
  // turn's events and groups `tool_use` items with `mcp__<server>__<tool>`
  // names into per-server multisets. Empty when there is no active turn or
  // the turn fired no mcp tools.
  const mcpCallsForTurn: McpToolCallSummary[] = useMemo(() => {
    if (activeTurnIndex == null) return [];
    const turn = turns[activeTurnIndex];
    if (!turn) return [];
    const turnEvents = getEventsForTurn(turn, events);
    const byServer = new Map<string, Map<string, number>>();
    for (const evt of turnEvents) {
      if (evt.type !== "assistant") continue;
      const content = evt.message?.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (typeof item !== "object" || item === null) continue;
        if ((item as { type?: string }).type !== "tool_use") continue;
        const name = (item as { name?: string }).name;
        if (typeof name !== "string") continue;
        if (!name.startsWith("mcp__")) continue;
        const rest = name.slice("mcp__".length);
        const sep = rest.indexOf("__");
        if (sep === -1) continue;
        const serverName = rest.slice(0, sep);
        const toolName = rest.slice(sep + 2);
        if (!serverName || !toolName) continue;
        const tools = byServer.get(serverName) ?? new Map<string, number>();
        tools.set(toolName, (tools.get(toolName) ?? 0) + 1);
        byServer.set(serverName, tools);
      }
    }
    return [...byServer.entries()]
      .map(([serverName, tools]) => ({
        serverName,
        totalCalls: [...tools.values()].reduce((a, b) => a + b, 0),
        byTool: tools,
      }))
      .sort((a, b) => b.totalCalls - a.totalCalls);
  }, [events, turns, activeTurnIndex]);

  const activeTurnNumber =
    activeTurnIndex != null && turns[activeTurnIndex]
      ? turns[activeTurnIndex].turnNumber
      : null;

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

  // Bug F — if ANY row is a "configured" disk-fallback entry, surface a
  // small banner clarifying that live status is unavailable for cold
  // (CLI-launched) sessions.
  const hasConfiguredRow = servers.some((s) => s.status === "configured");

  // Bug I — the per-turn tool-call section is rendered as a sibling beneath
  // the server list. The empty-servers branch falls through to here so the
  // per-turn surface remains visible even when no server status is loaded.
  return (
    <div className="flex flex-col h-full">
      <Header onRefresh={handleRefresh} disabled={!sessionId} />
      <div className="overflow-y-auto flex-1">
        {servers.length === 0 ? (
          <div className="p-3 t-mono-sm" style={{ color: "var(--t3)" }}>
            No MCP servers configured.
          </div>
        ) : (
          <>
            <ul className="t-mono-sm">
              {servers.map((srv) => (
                <ServerRow key={srv.name} server={srv} />
              ))}
            </ul>
            {hasConfiguredRow && (
              <div
                data-testid="mcp-cold-session-banner"
                className="t-mono-xs mt-2 mx-3 px-3 py-2 rounded"
                style={{ color: "var(--t3)", background: "var(--bg-h)" }}
              >
                Live connection status only available for sessions started from the dashboard. Showing configured servers from .mcp.json and settings files.
              </div>
            )}
          </>
        )}
        {activeTurnNumber !== null && mcpCallsForTurn.length > 0 && (
          <section
            data-testid="mcp-turn-tool-calls"
            style={{ borderTop: "1px solid var(--bd)" }}
          >
            <header
              className="px-3 py-2 t-mono-xs"
              style={{ color: "var(--t3)", background: "var(--bg-h)" }}
            >
              MCP tool calls in T{activeTurnNumber}
            </header>
            <ul className="t-mono-sm">
              {mcpCallsForTurn.map((srv) => (
                <li
                  key={srv.serverName}
                  data-testid={`mcp-turn-row-${srv.serverName}`}
                  className="px-3 py-2"
                  style={{ borderBottom: "1px solid var(--bd)", color: "var(--t1)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{srv.serverName}</span>
                    <span className="t-mono-xs" style={{ color: "var(--t2)" }}>
                      {srv.totalCalls} call{srv.totalCalls === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="t-mono-xs mt-1" style={{ color: "var(--t3)" }}>
                    {[...srv.byTool.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([tool, n]) => `${tool} ×${n}`)
                      .join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
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
    case "configured":
      return (
        <span data-testid="mcp-icon-configured" style={{ color: "var(--t3)" }} title="configured (no live status)">
          <Settings size={size} />
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
  if (!config) return null;
  if (config.type && config.url) return `${config.type} · ${config.url}`;
  if (config.type) return config.type;
  // Bug F — disk-fallback rows may omit `type` for legacy stdio entries that
  // only set `command`. Show "stdio" as a useful hint when a command exists.
  if (config.command) return `stdio · ${config.command}`;
  return null;
}
