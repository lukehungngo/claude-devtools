import { useState } from "react";
import { ShieldAlert, Check, X, ShieldCheck, Sparkles } from "lucide-react";
import type { PermissionRequest, PermissionSuggestion } from "../../lib/types";

interface PermissionBlockProps {
  permission: PermissionRequest;
  onDecide: (id: string, decision: "approved" | "denied") => void;
  onDecideSession?: (id: string) => void;
  onSuggestion?: (id: string, suggestion: PermissionSuggestion) => void;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/** Human-readable label for a suggestion */
function suggestionLabel(suggestion: PermissionSuggestion): string {
  if (suggestion.type === "setMode" && suggestion.mode) {
    return `Set mode: ${suggestion.mode}`;
  }
  if (suggestion.type === "addDirectories" && suggestion.directories?.length) {
    return `Allow directories: ${suggestion.directories.join(", ")}`;
  }
  if (suggestion.rules?.length) {
    const ruleNames = suggestion.rules.map((r) => r.ruleContent ?? r.toolName).join(", ");
    const verb = suggestion.type === "addRules" ? "Always allow" : suggestion.type === "removeRules" ? "Remove rule" : "Set rule";
    return `${verb}: ${ruleNames}`;
  }
  return `Apply ${suggestion.type}`;
}

function ToolInputDetail({ toolName, input }: { toolName: string; input: Record<string, unknown> }): JSX.Element | null {
  const filePath = input.file_path != null ? String(input.file_path) : null;

  switch (toolName) {
    case "Bash": {
      const command = input.command != null ? String(input.command) : null;
      return (
        <div className="flex flex-col gap-1">
          {command && (
            <pre className="text-xs font-mono px-2 py-1 rounded bg-dt-bg3 text-dt-text1 overflow-x-auto whitespace-pre-wrap break-all">
              {truncate(command, 500)}
            </pre>
          )}
        </div>
      );
    }

    case "Write": {
      const content = input.content != null ? String(input.content) : null;
      return (
        <div className="flex flex-col gap-1">
          {filePath && (
            <span className="text-xs text-dt-text2 font-mono truncate">{filePath}</span>
          )}
          {content && (
            <pre className="text-xs font-mono px-2 py-1 rounded bg-dt-bg3 text-dt-text1 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
              {truncate(content, 300)}
            </pre>
          )}
        </div>
      );
    }

    case "Edit": {
      const oldString = input.old_string != null ? String(input.old_string) : null;
      const newString = input.new_string != null ? String(input.new_string) : null;
      return (
        <div className="flex flex-col gap-1">
          {filePath && (
            <span className="text-xs text-dt-text2 font-mono truncate">{filePath}</span>
          )}
          {oldString && (
            <pre className="text-xs font-mono px-2 py-1 rounded bg-dt-red-dim text-dt-text1 overflow-x-auto whitespace-pre-wrap break-all max-h-16 overflow-y-auto">
              {truncate(oldString, 200)}
            </pre>
          )}
          {newString && (
            <pre className="text-xs font-mono px-2 py-1 rounded bg-dt-green-dim text-dt-text1 overflow-x-auto whitespace-pre-wrap break-all max-h-16 overflow-y-auto">
              {truncate(newString, 200)}
            </pre>
          )}
        </div>
      );
    }

    case "Read": {
      return filePath ? (
        <span className="text-xs text-dt-text2 font-mono truncate">{filePath}</span>
      ) : null;
    }

    default: {
      // Generic: show all input parameters
      const entries = Object.entries(input);
      if (entries.length === 0) return null;
      return (
        <div className="flex flex-col gap-0.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-1.5 text-xs">
              <span className="font-mono text-dt-text2">{key}:</span>
              <span className="font-mono text-dt-text1 truncate">
                {typeof value === "string" ? truncate(value, 200) : truncate(JSON.stringify(value), 200)}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }
}

export function PermissionBlock({ permission, onDecide, onDecideSession, onSuggestion }: PermissionBlockProps) {
  const [deciding, setDeciding] = useState(false);
  const isPending = permission.status === "pending";
  const isApproved = permission.status === "approved";
  const isDenied = permission.status === "denied";

  function handleDecide(decision: "approved" | "denied") {
    setDeciding(true);
    onDecide(permission.id, decision);
  }

  function handleDecideSession() {
    setDeciding(true);
    onDecideSession?.(permission.id);
  }

  function handleSuggestion(suggestion: PermissionSuggestion) {
    setDeciding(true);
    onSuggestion?.(permission.id, suggestion);
  }

  const borderColor = isPending
    ? "border-dt-yellow"
    : isApproved
    ? "border-dt-green"
    : "border-dt-red";

  const bgColor = isPending
    ? "bg-dt-yellow-dim"
    : isApproved
    ? "bg-dt-green-dim"
    : "bg-dt-red-dim";

  // Use title from SDK if available, otherwise fall back to generic header
  const headerText = permission.title ?? "Permission Required";

  // Use displayName for button labels if available
  const allowLabel = permission.displayName ? `Allow ${permission.displayName}` : "Allow";
  const denyLabel = permission.displayName ? `Deny ${permission.displayName}` : "Deny";

  const hasSuggestions = isPending && !deciding && permission.suggestions && permission.suggestions.length > 0;

  return (
    <div
      className={`rounded-xl border ${borderColor} ${bgColor} p-3 my-2 transition-all`}
      role={isPending ? "alert" : undefined}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert
          size={16}
          className={
            isPending
              ? "text-dt-yellow animate-pulse-opacity"
              : isApproved
              ? "text-dt-green"
              : "text-dt-red"
          }
        />
        <span
          data-testid="permission-title"
          className="text-sm font-semibold text-dt-text0"
          title={permission.title && permission.title.length > 80 ? permission.title : undefined}
        >
          {truncate(headerText, 80)}
        </span>
        <span
          data-testid="agent-id-badge"
          className="text-xxs font-mono px-1.5 py-0.5 rounded bg-dt-bg3 text-dt-text2"
          aria-label={`Agent: ${permission.agentId}`}
        >
          {permission.agentId === "main"
            ? "main"
            : permission.agentId.slice(0, 8)}
        </span>
      </div>

      {/* Description (from SDK) */}
      {permission.description && (
        <div className="pl-6 mb-2">
          <p data-testid="permission-description" className="text-xs text-dt-text2">
            {permission.description}
          </p>
        </div>
      )}

      {/* Tool name */}
      <div className="flex items-center gap-2 mb-2 pl-6">
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-dt-bg3 text-dt-accent">
          {permission.toolName}
        </span>
      </div>

      {/* Tool-specific input detail */}
      <div className="pl-6 mb-2">
        <ToolInputDetail toolName={permission.toolName} input={permission.input} />
      </div>

      {/* Suggestions bar (from SDK) */}
      {hasSuggestions && (
        <div className="pl-6 mb-2 flex flex-wrap gap-1.5" data-testid="suggestions-bar">
          {permission.suggestions!.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestion(suggestion)}
              aria-label={`Apply suggestion: ${suggestionLabel(suggestion)}`}
              className="flex items-center gap-1 border border-dt-accent/40 text-dt-accent bg-transparent hover:bg-dt-accent/10 rounded-dt px-2 py-1 text-xs font-mono cursor-pointer transition-colors"
            >
              <Sparkles size={12} />
              {suggestionLabel(suggestion)}
            </button>
          ))}
        </div>
      )}

      {/* Actions or resolved status */}
      <div className="pl-6">
        {isPending && !deciding ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleDecide("approved")}
              aria-label={`Approve permission for ${permission.toolName}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-dt bg-dt-green/20 text-dt-green text-sm font-semibold hover:bg-dt-green/30 transition-colors cursor-pointer"
            >
              <Check size={14} /> {allowLabel}
            </button>
            {onDecideSession && (
              <button
                onClick={handleDecideSession}
                aria-label={`Allow ${permission.toolName} for this session`}
                className="flex items-center gap-1 px-3 py-1.5 rounded-dt bg-dt-accent/20 text-dt-accent text-sm font-semibold hover:bg-dt-accent/30 transition-colors cursor-pointer"
              >
                <ShieldCheck size={14} /> Allow for session
              </button>
            )}
            <button
              onClick={() => handleDecide("denied")}
              aria-label={`Deny permission for ${permission.toolName}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-dt bg-dt-red/20 text-dt-red text-sm font-semibold hover:bg-dt-red/30 transition-colors cursor-pointer"
            >
              <X size={14} /> {denyLabel}
            </button>
          </div>
        ) : isPending && deciding ? (
          <span className="text-xs text-dt-text2">Processing...</span>
        ) : (
          <span
            aria-live="polite"
            className={`text-xs font-semibold ${
              isApproved ? "text-dt-green" : isDenied ? "text-dt-red" : ""
            }`}
          >
            {isApproved ? "Approved" : "Denied"}
          </span>
        )}
      </div>
    </div>
  );
}
