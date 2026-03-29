import { useState } from "react";
import { ShieldAlert, Check, X, ShieldCheck } from "lucide-react";
import type { PermissionRequest } from "../../lib/types";

interface PermissionBlockProps {
  permission: PermissionRequest;
  onDecide: (id: string, decision: "approved" | "denied") => void;
  onDecideSession?: (id: string) => void;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
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

export function PermissionBlock({ permission, onDecide, onDecideSession }: PermissionBlockProps) {
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
        <span className="text-sm font-semibold text-dt-text0">
          Permission Required
        </span>
      </div>

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

      {/* Actions or resolved status */}
      <div className="pl-6">
        {isPending && !deciding ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDecide("approved")}
              aria-label={`Approve permission for ${permission.toolName}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-dt bg-dt-green/20 text-dt-green text-sm font-semibold hover:bg-dt-green/30 transition-colors cursor-pointer"
            >
              <Check size={14} /> Allow
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
              <X size={14} /> Deny
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
