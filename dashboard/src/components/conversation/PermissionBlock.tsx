import { useState } from "react";
import { ShieldAlert, Check, X } from "lucide-react";
import type { PermissionRequest } from "../../lib/types";

interface PermissionBlockProps {
  permission: PermissionRequest;
  onDecide: (id: string, decision: "approved" | "denied") => void;
}

export function PermissionBlock({ permission, onDecide }: PermissionBlockProps) {
  const [deciding, setDeciding] = useState(false);
  const isPending = permission.status === "pending";
  const isApproved = permission.status === "approved";
  const isDenied = permission.status === "denied";

  function handleDecide(decision: "approved" | "denied") {
    setDeciding(true);
    onDecide(permission.id, decision);
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

      {/* Tool detail */}
      <div className="flex items-center gap-2 mb-2 pl-6">
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-dt-bg3 text-dt-accent">
          {permission.toolName}
        </span>
        {permission.input?.file_path != null && (
          <span className="text-xs text-dt-text2 font-mono truncate">
            {String(permission.input.file_path)}
          </span>
        )}
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
