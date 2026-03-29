import { useState, useEffect, useRef } from "react";

/** Shape matching the dashboard's slash command autocomplete format */
interface DashboardSlashCommand {
  name: string;
  description: string;
}

/** Hardcoded fallback commands matching the current SLASH_COMMANDS in PromptInput */
const FALLBACK_COMMANDS: DashboardSlashCommand[] = [
  { name: "/help",    description: "Show available commands" },
  { name: "/clear",   description: "Clear context (starts new session)" },
  { name: "/compact", description: "Compact the conversation context" },
  { name: "/context", description: "Show context window usage" },
  { name: "/copy",    description: "Copy last assistant response(s) to clipboard" },
  { name: "/cost",    description: "Show session cost summary" },
  { name: "/diff",    description: "Show git diff (uncommitted changes)" },
  { name: "/effort",  description: "Set effort level (low | medium | high)" },
  { name: "/fast",    description: "Toggle fast mode (on | off)" },
  { name: "/hooks",   description: "View configured hooks" },
  { name: "/init",    description: "Initialize CLAUDE.md in project" },
  { name: "/mcp",     description: "Show connected MCP servers and tools" },
  { name: "/memory",  description: "View CLAUDE.md content" },
  { name: "/model",   description: "Show current model info" },
  { name: "/permissions", description: "Show permission mode and allowances" },
  { name: "/plan",    description: "Switch to plan mode (read-only)" },
  { name: "/rename",  description: "Rename the current session" },
  { name: "/rewind",  description: "Rewind conversation (optional: N turns)" },
  { name: "/settings", description: "View session settings" },
  { name: "/tasks",     description: "Show task summary" },
  { name: "/analytics", description: "Show cross-session analytics" },
  { name: "/usage",   description: "Show rate limit utilization" },
  { name: "/export",  description: "Export conversation (md | json)" },
  { name: "/shortcuts", description: "Show keyboard shortcuts" },
  { name: "/doctor",  description: "Run system diagnostics" },
  { name: "/stats",   description: "Show usage statistics" },
  { name: "/exit",    description: "Exit the current session" },
];

/**
 * Fetches slash commands from the discovery endpoint.
 * Falls back to hardcoded commands on error or when no sessionId.
 * Caches results per sessionId -- does not refetch unless sessionId changes.
 */
export function useDiscoveryCommands(sessionId: string | undefined): DashboardSlashCommand[] {
  const [commands, setCommands] = useState<DashboardSlashCommand[]>(FALLBACK_COMMANDS);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setCommands(FALLBACK_COMMANDS);
      fetchedForRef.current = null;
      return;
    }

    // Already fetched for this sessionId -- skip
    if (fetchedForRef.current === sessionId) return;

    let cancelled = false;

    fetch(`/api/sessions/${sessionId}/commands`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { commands?: Array<{ name: string; description: string }> }) => {
        if (cancelled) return;
        if (data.commands && Array.isArray(data.commands) && data.commands.length > 0) {
          // SDK commands have name without leading slash; add it for dashboard format
          const mapped = data.commands.map((c) => ({
            name: c.name.startsWith("/") ? c.name : "/" + c.name,
            description: c.description,
          }));
          setCommands(mapped);
          fetchedForRef.current = sessionId;
        }
      })
      .catch(() => {
        // Keep fallback on error -- do not update state
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return commands;
}
