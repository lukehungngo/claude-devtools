import { Server, Terminal } from "lucide-react";

interface McpServer {
  name: string;
  command: string | null;
  args: string[];
  status: "configured" | "connected" | "disconnected" | "error";
  toolCount: number;
}

interface McpManagerProps {
  servers: McpServer[];
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

export function McpManager({ servers }: McpManagerProps): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">
      <div className="flex items-center gap-2">
        <Server className="w-5 h-5 text-dt-text1" />
        <h2 className="text-lg font-bold text-dt-text0">MCP Servers</h2>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
