import type { SessionMetrics, UsageInfo, CostSummary, SessionEvent } from "./types";
import { formatCostCommand, formatUsageCommand, formatDiffCommand, formatMcpCommand, formatTasksCommand, formatAnalyticsCommand, formatContextCommand, formatPermissionsCommand } from "./commandFormatters";
import { generateMarkdownExport, generateJsonExport, triggerDownload } from "./exportSession";

/** Model name shortcuts for /model command */
const MODEL_SHORTCUTS: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

/** Commands that are forwarded to the server rather than handled client-side */
export const SERVER_FORWARDED_COMMANDS = new Set(["/compact", "/clear", "/rewind"]);

export interface SlashCommandContext {
  sessionCwd?: string;
  sessionId?: string;
  projectHash?: string;
  activeSessionId?: string;
  metrics?: SessionMetrics | null;
  usage?: UsageInfo | null;
  costs?: CostSummary | null;
  events?: SessionEvent[];
  getAssistantResponses?: (count: number) => string[];
  onSessionStarted?: (sessionId: string) => void;
  onOpenPanel?: (panel: string) => void;
}

export type ShowOutputFn = (msg: string) => void;

/**
 * Handle a client-side slash command. Returns true if the command was handled
 * (and should NOT be sent as a message to the server), false if it should be
 * forwarded as a regular message.
 */
export async function handleSlashCommand(
  trimmed: string,
  ctx: SlashCommandContext,
  showOutput: ShowOutputFn
): Promise<boolean> {
  const command = trimmed.split(/\s+/)[0];

  // /compact and /rewind are sent as messages to the SDK (handled natively by Claude Code)
  if (command === "/compact" || command === "/rewind") {
    return false; // Fall through to message-sending path
  }

  if (command === "/clear") {
    try {
      const res = await fetch("/api/sessions/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: ctx.sessionCwd || "/" }),
      });
      const data = await res.json();
      if (data.sessionId) {
        ctx.onSessionStarted?.(data.sessionId);
      }
    } catch {
      showOutput("Failed to start new session.");
    }
    return true;
  }

  if (command === "/copy") {
    const parts = trimmed.split(/\s+/);
    const countArg = parts[1] ? parseInt(parts[1], 10) : 1;
    const count = isNaN(countArg) || countArg < 1 ? 1 : countArg;

    if (!ctx.getAssistantResponses) {
      showOutput("No responses to copy.");
      return true;
    }

    const responses = ctx.getAssistantResponses(count);
    if (responses.length === 0) {
      showOutput("No responses to copy.");
      return true;
    }

    const text = responses.join("\n\n---\n\n");
    navigator.clipboard.writeText(text).then(
      () => showOutput(`Copied ${responses.length} response${responses.length !== 1 ? "s" : ""} to clipboard`),
      () => showOutput("Failed to copy to clipboard.")
    );
    return true;
  }

  if (command === "/cost") {
    showOutput(formatCostCommand(ctx.metrics ?? null));
    return true;
  }

  if (command === "/diff") {
    const result = await formatDiffCommand(ctx.projectHash, ctx.sessionId);
    showOutput(result);
    return true;
  }

  if (command === "/mcp") {
    ctx.onOpenPanel?.("mcp");
    showOutput(formatMcpCommand(ctx.metrics ?? null));
    return true;
  }

  if (command === "/context") {
    showOutput(formatContextCommand(ctx.metrics ?? null));
    return true;
  }

  if (command === "/permissions") {
    ctx.onOpenPanel?.("permissions");
    const targetId = ctx.activeSessionId || ctx.sessionId;
    if (!targetId) {
      showOutput(formatPermissionsCommand(null));
      return true;
    }
    try {
      const res = await fetch(`/api/sessions/${targetId}/permissions-info`);
      const data = await res.json();
      showOutput(formatPermissionsCommand(data));
    } catch {
      showOutput(formatPermissionsCommand(null));
    }
    return true;
  }

  if (command === "/usage") {
    showOutput(formatUsageCommand(ctx.usage ?? null));
    return true;
  }

  if (command === "/fast") {
    const parts = trimmed.split(/\s+/);
    const arg = parts[1]?.toLowerCase();
    const targetId = ctx.activeSessionId || ctx.sessionId;

    if (!targetId) {
      showOutput("No active session. Start or resume a session first.");
      return true;
    }

    const enabled = arg === "off" ? false : true;

    try {
      const res = await fetch(`/api/sessions/${targetId}/fast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success) {
        showOutput(`Fast mode ${data.fastMode ? "enabled" : "disabled"}`);
      } else {
        showOutput(`Failed to set fast mode: ${data.error || "unknown error"}`);
      }
    } catch {
      showOutput("Failed to set fast mode.");
    }
    return true;
  }

  if (command === "/effort") {
    const parts = trimmed.split(/\s+/);
    const levelArg = parts[1]?.toLowerCase();
    const validLevels = new Set(["low", "medium", "high"]);

    if (!levelArg) {
      showOutput("Usage: /effort low | medium | high (sets effort level for the session)");
      return true;
    }

    if (!validLevels.has(levelArg)) {
      showOutput("Invalid effort level. Use: /effort low | medium | high");
      return true;
    }

    const targetId = ctx.activeSessionId || ctx.sessionId;
    if (!targetId) {
      showOutput("No active session. Start or resume a session first.");
      return true;
    }

    try {
      const res = await fetch(`/api/sessions/${targetId}/effort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: levelArg }),
      });
      const data = await res.json();
      if (data.success) {
        showOutput(`Effort level set to ${data.effortLevel}`);
      } else {
        showOutput(`Failed to set effort level: ${data.error || "unknown error"}`);
      }
    } catch {
      showOutput("Failed to set effort level.");
    }
    return true;
  }

  if (command === "/plan") {
    const parts = trimmed.split(/\s+/);
    const arg = parts[1]?.toLowerCase();
    const targetId = ctx.activeSessionId || ctx.sessionId;

    if (!targetId) {
      showOutput("No active session. Start or resume a session first.");
      return true;
    }

    const mode = arg === "off" ? "default" : "plan";

    try {
      const res = await fetch(`/api/sessions/${targetId}/permission-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.success) {
        const label = data.mode === "plan" ? "Plan" : "Default";
        showOutput(`Switched to ${label} mode${data.mode === "plan" ? " (read-only)" : ""}`);
      } else {
        showOutput(`Failed to switch mode: ${data.error || "unknown error"}`);
      }
    } catch {
      showOutput("Failed to switch permission mode.");
    }
    return true;
  }

  if (command === "/rename") {
    const parts = trimmed.split(/\s+/);
    const newName = parts.slice(1).join(" ").trim();

    if (!newName) {
      showOutput("Usage: /rename <new name> (renames the current session)");
      return true;
    }

    const targetId = ctx.activeSessionId || ctx.sessionId;
    if (!targetId) {
      showOutput("No active session to rename.");
      return true;
    }

    try {
      const res = await fetch(`/api/sessions/${targetId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newName }),
      });
      const data = await res.json();
      if (data.success) {
        const SESSION_NAMES_KEY = "session-names";
        const raw = localStorage.getItem(SESSION_NAMES_KEY);
        const names: Record<string, string> = raw ? JSON.parse(raw) : {};
        names[targetId] = data.title;
        localStorage.setItem(SESSION_NAMES_KEY, JSON.stringify(names));
        showOutput(`Session renamed to "${data.title}"`);
      } else {
        showOutput(`Failed to rename: ${data.error || "unknown error"}`);
      }
    } catch {
      showOutput("Failed to rename session.");
    }
    return true;
  }

  if (command === "/tasks") {
    showOutput(formatTasksCommand(ctx.metrics ?? null));
    return true;
  }

  if (command === "/analytics") {
    showOutput(formatAnalyticsCommand(ctx.costs ?? null));
    return true;
  }

  if (command === "/export") {
    const parts = trimmed.split(/\s+/);
    const format = parts[1]?.toLowerCase() || "md";

    if (format !== "md" && format !== "json") {
      showOutput("Usage: /export md | json");
      return true;
    }

    const exportEvents = ctx.events ?? [];
    const sid = ctx.sessionId || "unknown";

    if (exportEvents.length === 0) {
      showOutput("No conversation to export.");
      return true;
    }

    if (format === "md") {
      const content = generateMarkdownExport(exportEvents, sid);
      triggerDownload(content, `session-${sid}.md`, "text/markdown");
      showOutput("Exported conversation as Markdown");
    } else {
      const content = generateJsonExport(exportEvents, sid);
      triggerDownload(content, `session-${sid}.json`, "application/json");
      showOutput("Exported conversation as JSON");
    }
    return true;
  }

  if (command === "/shortcuts") {
    const isMac = typeof navigator !== "undefined" && navigator.platform?.includes("Mac");
    const mod = isMac ? "Cmd" : "Ctrl";
    showOutput(
      `Keyboard Shortcuts:\n` +
      `  ${mod}+L          Clear conversation\n` +
      `  ${mod}+Shift+K    Compact context\n` +
      `  ${mod}+F          Search transcript\n` +
      `  ${mod}+B          Toggle task monitor\n` +
      `  ${mod}+T          Toggle task panel\n` +
      `  Alt+P             Model picker\n` +
      `  Alt+T             Toggle thinking visibility\n` +
      `  Alt+O             Toggle fast mode\n` +
      `  Esc Esc           Rewind menu\n` +
      `  Escape            Close modal / dismiss\n` +
      `  Shift+Tab         Cycle permission mode\n` +
      `  Enter             Send message\n` +
      `  Shift+Enter       New line in input\n` +
      `  Up Arrow          Previous prompt history`
    );
    return true;
  }

  if (command === "/doctor") {
    ctx.onOpenPanel?.("doctor");
    showOutput("Opening diagnostics panel...");
    return true;
  }

  if (command === "/stats") {
    ctx.onOpenPanel?.("stats");
    showOutput("Opening statistics panel...");
    return true;
  }

  if (command === "/settings") {
    ctx.onOpenPanel?.("settings");
    showOutput("Opening settings panel...");
    return true;
  }

  if (command === "/hooks") {
    ctx.onOpenPanel?.("hooks");
    showOutput("Opening hooks panel...");
    return true;
  }

  if (command === "/memory") {
    ctx.onOpenPanel?.("memory");
    showOutput("Opening memory panel...");
    return true;
  }

  if (command === "/init") {
    const targetId = ctx.activeSessionId || ctx.sessionId;
    if (!targetId) {
      showOutput("No active session. Start or resume a session first.");
      return true;
    }
    try {
      const res = await fetch(`/api/sessions/${targetId}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.created) {
        showOutput("CLAUDE.md created successfully.");
      } else {
        showOutput(data.message || "CLAUDE.md already exists.");
      }
    } catch {
      showOutput("Failed to initialize CLAUDE.md.");
    }
    return true;
  }

  if (command === "/model") {
    const parts = trimmed.split(/\s+/);
    const modelArg = parts[1]?.trim();

    if (!modelArg) {
      showOutput("Current model: default (use /model opus|sonnet|haiku to switch)");
      return true;
    }

    const resolvedModel = MODEL_SHORTCUTS[modelArg.toLowerCase()] || modelArg;
    const targetId = ctx.activeSessionId || ctx.sessionId;

    if (!targetId) {
      showOutput("No active session. Start or resume a session first.");
      return true;
    }

    try {
      const res = await fetch(`/api/sessions/${targetId}/model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: resolvedModel }),
      });
      const data = await res.json();
      if (data.success) {
        showOutput(`Model switched to ${data.model}`);
      } else {
        showOutput(`Failed to switch model: ${data.error || "unknown error"}`);
      }
    } catch {
      showOutput("Failed to switch model.");
    }
    return true;
  }

  if (command === "/resume") {
    const parts = trimmed.split(/\s+/);
    const arg = parts[1]?.toLowerCase();

    if (arg === "last") {
      // Continue most recent session in cwd
      const targetId = ctx.activeSessionId || ctx.sessionId;
      if (!targetId) {
        showOutput("No active session to resume.");
        return true;
      }
      try {
        const res = await fetch(`/api/sessions/${targetId}/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (data.success) {
          showOutput("Resuming last session...");
        } else {
          showOutput(`Failed to resume: ${data.error || "unknown error"}`);
        }
      } catch {
        showOutput("Failed to resume session.");
      }
    } else {
      // Show recent sessions list
      try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        const sessions = (data.sessions || []).slice(0, 10);
        if (sessions.length === 0) {
          showOutput("No sessions found.");
        } else {
          const list = sessions.map((s: { id: string; title?: string; cwd?: string }, i: number) =>
            `  ${i + 1}. ${s.title || s.id.slice(0, 8)} — ${s.cwd || "unknown"}`
          ).join("\n");
          showOutput(`Recent sessions:\n${list}\n\nUse /resume last to continue the most recent session.`);
        }
      } catch {
        showOutput("Failed to list sessions.");
      }
    }
    return true;
  }

  if (command === "/review") {
    const parts = trimmed.split(/\s+/);
    const arg = parts.slice(1).join(" ").trim();
    // Forward as a prompt to Claude — let it use its built-in review capabilities
    if (!arg) {
      // No arg: review current changes
      return false; // Let it go as "/review" message to SDK
    }
    // With PR number/URL: forward as message
    return false;
  }

  if (command === "/agents") {
    ctx.onOpenPanel?.("agents");
    showOutput("Opening agents panel...");
    return true;
  }

  if (command === "/add-dir") {
    const parts = trimmed.split(/\s+/);
    const dir = parts.slice(1).join(" ").trim();

    if (!dir) {
      showOutput("Usage: /add-dir <path> (adds a directory to the session context)");
      return true;
    }

    const targetId = ctx.activeSessionId || ctx.sessionId;
    if (!targetId) {
      showOutput("No active session. Start or resume a session first.");
      return true;
    }

    try {
      const res = await fetch(`/api/sessions/${targetId}/add-dir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir }),
      });
      const data = await res.json();
      if (data.success) {
        showOutput(`Added directory: ${data.directory}`);
      } else {
        showOutput(`Failed: ${data.error || "unknown error"}`);
      }
    } catch {
      showOutput("Failed to add directory.");
    }
    return true;
  }

  if (command === "/login") {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.authUrl) {
        showOutput(`Open this URL to log in:\n${data.authUrl}`);
      } else if (data.message) {
        showOutput(data.message);
      } else {
        showOutput("Login initiated. Check terminal for auth flow.");
      }
    } catch {
      showOutput("Failed to initiate login.");
    }
    return true;
  }

  if (command === "/logout") {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      showOutput(data.message || "Logged out.");
    } catch {
      showOutput("Failed to log out.");
    }
    return true;
  }

  if (command === "/output-style") {
    const parts = trimmed.split(/\s+/);
    const arg = parts.slice(1).join(" ").trim();
    const targetId = ctx.activeSessionId || ctx.sessionId;

    if (!arg) {
      // List available styles
      try {
        const res = await fetch("/api/output-styles");
        const data = await res.json();
        const styles = data.styles || [];
        if (styles.length === 0) {
          showOutput("No output styles found. Add styles to ~/.claude/output-styles/");
        } else {
          const list = styles.map((s: { name: string; description?: string }) =>
            `  ${s.name}${s.description ? ` — ${s.description}` : ""}`
          ).join("\n");
          showOutput(`Available output styles:\n${list}\n\nUsage: /output-style <name> | /output-style none`);
        }
      } catch {
        showOutput("Failed to list output styles.");
      }
      return true;
    }

    if (!targetId) {
      showOutput("No active session. Start or resume a session first.");
      return true;
    }

    try {
      const res = await fetch(`/api/sessions/${targetId}/output-style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: arg === "none" ? null : arg }),
      });
      const data = await res.json();
      if (data.success) {
        showOutput(data.style ? `Output style set to "${data.style}"` : "Output style cleared");
      } else {
        showOutput(`Failed: ${data.error || "unknown error"}`);
      }
    } catch {
      showOutput("Failed to set output style.");
    }
    return true;
  }

  // Unknown command
  showOutput(getCommandOutput(command));
  return true;
}

function getCommandOutput(command: string): string {
  switch (command) {
    case "/help":
      return "Available commands: /add-dir, /agents, /analytics, /clear, /compact, /context, /copy, /cost, /diff, /doctor, /effort, /export, /fast, /help, /hooks, /init, /login, /logout, /mcp, /memory, /model, /output-style, /permissions, /plan, /rename, /resume, /review, /rewind, /settings, /shortcuts, /stats, /tasks, /usage, /exit";
    case "/clear":
      return "";
    case "/cost":
      return "View session costs in the TopBar metrics.";
    case "/model":
      return "Model configuration is set in your Claude Code settings.";
    case "/exit":
      return "To exit, close this session or select another in the sidebar.";
    default:
      return `Unknown command: ${command}`;
  }
}
