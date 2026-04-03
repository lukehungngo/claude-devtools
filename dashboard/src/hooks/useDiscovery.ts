import { useState, useEffect, useRef } from "react";

/** Shape matching the dashboard's slash command autocomplete format */
interface DashboardSlashCommand {
  name: string;
  description: string;
}

/** Dashboard-only commands not available in the CLI — always merged into the list */
const DASHBOARD_ONLY_COMMANDS: DashboardSlashCommand[] = [
  { name: "/copy",      description: "Copy last assistant response(s) to clipboard" },
  { name: "/export",    description: "Export conversation (md | json)" },
  { name: "/analytics", description: "Show cross-session analytics" },
  { name: "/shortcuts", description: "Show keyboard shortcuts" },
  { name: "/exit",      description: "Exit the current session" },
];

/**
 * Client-side fallback commands matching the server's FALLBACK_COMMANDS.
 * Used when no sessionId is available (no server fetch).
 * Keep in sync with server/src/http/routes/discovery-routes.ts FALLBACK_COMMANDS.
 */
const CLIENT_FALLBACK_COMMANDS: DashboardSlashCommand[] = [
  { name: "/add-dir",     description: "Add a directory to the session context" },
  { name: "/agents",      description: "Show available subagents" },
  { name: "/bug",         description: "Report a bug" },
  { name: "/clear",       description: "Clear context (starts new session)" },
  { name: "/compact",     description: "Compact the conversation context" },
  { name: "/context",     description: "Show context window usage" },
  { name: "/cost",        description: "Show session cost summary" },
  { name: "/diff",        description: "Show git diff (uncommitted changes)" },
  { name: "/doctor",      description: "Run system diagnostics" },
  { name: "/effort",      description: "Set effort level" },
  { name: "/fast",        description: "Toggle fast mode" },
  { name: "/help",        description: "Show available commands" },
  { name: "/hooks",       description: "View configured hooks" },
  { name: "/init",        description: "Initialize CLAUDE.md in project" },
  { name: "/login",       description: "Log in to your Anthropic account" },
  { name: "/logout",      description: "Log out of your Anthropic account" },
  { name: "/mcp",         description: "Show connected MCP servers and tools" },
  { name: "/memory",      description: "View CLAUDE.md content" },
  { name: "/model",       description: "Show or switch model" },
  { name: "/output-style", description: "Set output style" },
  { name: "/permissions", description: "Show permission mode and allowances" },
  { name: "/plan",        description: "Switch to plan mode (read-only)" },
  { name: "/rename",      description: "Rename the current session" },
  { name: "/resume",      description: "Resume a previous session" },
  { name: "/review",      description: "Review a PR or diff" },
  { name: "/rewind",      description: "Rewind conversation" },
  { name: "/settings",    description: "View session settings" },
  { name: "/shortcuts",   description: "Show keyboard shortcuts" },
  { name: "/stats",       description: "Show usage statistics" },
  { name: "/tasks",       description: "Show task summary" },
  { name: "/usage",       description: "Show rate limit utilization" },
];

/** Merge SDK/server commands with dashboard-only commands, deduplicating by name */
function mergeWithDashboardCommands(commands: DashboardSlashCommand[]): DashboardSlashCommand[] {
  const existing = new Set(commands.map((c) => c.name));
  const extras = DASHBOARD_ONLY_COMMANDS.filter((c) => !existing.has(c.name));
  return extras.length > 0 ? [...commands, ...extras] : commands;
}

/** Shape for a discovered model */
interface DiscoveryModel {
  id: string;
  name: string;
}

/** Shape for a discovered agent */
interface DiscoveryAgent {
  id: string;
  name: string;
}

/**
 * Fetches slash commands from the discovery endpoint.
 * Falls back to hardcoded commands on error or when no sessionId.
 * Caches results per sessionId -- does not refetch unless sessionId changes.
 */
export function useDiscoveryCommands(sessionId: string | undefined): DashboardSlashCommand[] {
  const [commands, setCommands] = useState<DashboardSlashCommand[]>(mergeWithDashboardCommands(CLIENT_FALLBACK_COMMANDS));
  const fetchedForRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const endpoint = sessionId
      ? `/api/sessions/${sessionId}/commands`
      : "/api/commands";
    const cacheKey = sessionId ?? "__global__";

    // Already fetched authoritative commands for this key -- skip
    if (fetchedForRef.current === cacheKey) return;

    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    function applyCommands(data: { commands?: Array<{ name: string; description: string }>; source?: string }) {
      if (cancelled) return;
      if (data.commands && Array.isArray(data.commands) && data.commands.length > 0) {
        const mapped = data.commands.map((c) => ({
          name: c.name.startsWith("/") ? c.name : "/" + c.name,
          description: c.description,
        }));
        setCommands(mergeWithDashboardCommands(mapped));

        // Mark as "done" if we got authoritative commands
        if (data.source === "sdk" || data.source === "cached" || data.source === "global-cache") {
          fetchedForRef.current = cacheKey;
        } else if (retryCount < MAX_RETRIES) {
          // Got fallback — retry after 3s (server may cache SDK commands after first message)
          retryCount++;
          retryTimerRef.current = setTimeout(() => {
            if (!cancelled) fetchCommands();
          }, 3000);
        }
      }
    }

    function fetchCommands() {
      fetch(endpoint)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(applyCommands)
        .catch(() => {
          // Session-specific endpoint failed (e.g. 404 for historical sessions)
          // Fall back to global commands endpoint
          if (sessionId && !cancelled) {
            fetch("/api/commands")
              .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
              })
              .then(applyCommands)
              .catch(() => {
                // Keep client fallback on error
              });
          }
        });
    }

    fetchCommands();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [sessionId]);

  return commands;
}

/**
 * Fetches available models from the discovery endpoint.
 * Falls back to empty array on error or when no sessionId.
 * Caches results per sessionId -- does not refetch unless sessionId changes.
 */
export function useDiscoveryModels(sessionId: string | undefined): DiscoveryModel[] {
  const [models, setModels] = useState<DiscoveryModel[]>([]);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setModels([]);
      fetchedForRef.current = null;
      return;
    }

    if (fetchedForRef.current === sessionId) return;

    let cancelled = false;

    fetch(`/api/sessions/${sessionId}/models`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { models?: DiscoveryModel[] }) => {
        if (cancelled) return;
        if (data.models && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
          fetchedForRef.current = sessionId;
        }
      })
      .catch(() => {
        // Keep empty fallback on error
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return models;
}

/**
 * Fetches available agents from the discovery endpoint.
 * Falls back to empty array on error or when no sessionId.
 * Caches results per sessionId -- does not refetch unless sessionId changes.
 */
export function useDiscoveryAgents(sessionId: string | undefined): DiscoveryAgent[] {
  const [agents, setAgents] = useState<DiscoveryAgent[]>([]);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setAgents([]);
      fetchedForRef.current = null;
      return;
    }

    if (fetchedForRef.current === sessionId) return;

    let cancelled = false;

    fetch(`/api/sessions/${sessionId}/agents`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { agents?: DiscoveryAgent[] }) => {
        if (cancelled) return;
        if (data.agents && Array.isArray(data.agents) && data.agents.length > 0) {
          setAgents(data.agents);
          fetchedForRef.current = sessionId;
        }
      })
      .catch(() => {
        // Keep empty fallback on error
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return agents;
}
