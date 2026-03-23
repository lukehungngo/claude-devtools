import { useState } from "react";
import { CommandInput } from "./CommandInput";
import { PermissionPanel } from "./PermissionPanel";
import type { PermissionRequest } from "../lib/types";

interface Props {
  permissions: PermissionRequest[];
  onDecidePermission: (id: string, decision: "approved" | "denied") => void;
}

export function BottomPanel({ permissions, onDecidePermission }: Props) {
  const [activeTab, setActiveTab] = useState<"command" | "permissions">(
    "command"
  );
  const pendingCount = permissions.filter((p) => p.status === "pending").length;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 pt-1 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab("command")}
          className={`px-3 py-1.5 text-xs rounded-t transition ${
            activeTab === "command"
              ? "bg-gray-100 dark:bg-gray-800 font-medium"
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Command
        </button>
        <button
          onClick={() => setActiveTab("permissions")}
          className={`px-3 py-1.5 text-xs rounded-t transition flex items-center gap-1.5 ${
            activeTab === "permissions"
              ? "bg-gray-100 dark:bg-gray-800 font-medium"
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Permissions
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 bg-yellow-500 text-white rounded-full text-xxs leading-none">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "command" ? (
          <CommandInput />
        ) : (
          <PermissionPanel
            permissions={permissions}
            onDecide={onDecidePermission}
          />
        )}
      </div>
    </div>
  );
}
