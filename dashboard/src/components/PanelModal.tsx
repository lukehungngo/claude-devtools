import { useEffect, useCallback, Suspense, lazy } from "react";
import { X } from "lucide-react";
import type { SessionMetrics, UsageInfo, PermissionRequest } from "../lib/types";

const SettingsPanel = lazy(() =>
  import("./panels/SettingsPanel").then((m) => ({ default: m.SettingsPanel })),
);
const HookEditor = lazy(() =>
  import("./panels/HookEditor").then((m) => ({ default: m.HookEditor })),
);
const MemoryEditor = lazy(() =>
  import("./panels/MemoryEditor").then((m) => ({ default: m.MemoryEditor })),
);
const PermissionRulesEditor = lazy(() =>
  import("./panels/PermissionRulesEditor").then((m) => ({
    default: m.PermissionRulesEditor,
  })),
);
const McpManager = lazy(() =>
  import("./panels/McpManager").then((m) => ({ default: m.McpManager })),
);
const AgentManager = lazy(() =>
  import("./panels/AgentManager").then((m) => ({ default: m.AgentManager })),
);
const DoctorPanel = lazy(() =>
  import("./panels/DoctorPanel").then((m) => ({ default: m.DoctorPanel })),
);
const StatsPanel = lazy(() =>
  import("./panels/StatsPanel").then((m) => ({ default: m.StatsPanel })),
);
const PermissionHistory = lazy(() =>
  import("./panels/PermissionHistory").then((m) => ({ default: m.PermissionHistory })),
);

interface PanelModalProps {
  panel: string | null;
  onClose: () => void;
  metrics?: SessionMetrics | null;
  usage?: UsageInfo | null;
  permissions?: PermissionRequest[];
  projectHash?: string;
  sessionId?: string;
}

const PANEL_TITLES: Record<string, string> = {
  settings: "Settings",
  hooks: "Hooks",
  memory: "CLAUDE.md",
  permissions: "Permissions",
  mcp: "MCP Servers",
  agents: "Agents",
  doctor: "Doctor",
  stats: "Stats",
  "permission-history": "Permission History",
};

function renderPanel(panel: string, props: PanelModalProps) {
  switch (panel) {
    case "settings":
      return (
        <SettingsPanel
          metrics={props.metrics ?? null}
          usage={props.usage ?? null}
        />
      );
    case "hooks":
      return <HookEditor />;
    case "memory":
      return (
        <MemoryEditor
          projectHash={props.projectHash}
          sessionId={props.sessionId}
        />
      );
    case "permissions":
      return <PermissionRulesEditor />;
    case "mcp":
      return <McpManager sessionId={props.sessionId} />;
    case "agents":
      return <AgentManager />;
    case "doctor":
      return <DoctorPanel />;
    case "stats":
      return <StatsPanel />;
    case "permission-history":
      return <PermissionHistory permissions={props.permissions ?? []} />;
    default:
      return (
        <div className="p-4 text-dt-text2">Unknown panel: {panel}</div>
      );
  }
}

export function PanelModal(props: PanelModalProps) {
  const { panel, onClose } = props;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!panel) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [panel, handleKeyDown]);

  if (!panel) return null;

  const title = PANEL_TITLES[panel] ?? panel;

  return (
    <div
      data-testid="panel-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        data-testid="panel-modal-content"
        className="flex flex-col bg-dt-bg-panel border border-dt-border rounded-lg shadow-xl w-[90vw] max-w-[900px] h-[85vh] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-dt-border">
          <h2 className="text-sm font-semibold text-dt-text">{title}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded text-dt-text3 hover:text-dt-text hover:bg-dt-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-32 text-dt-text3 text-sm">
                Loading...
              </div>
            }
          >
            {renderPanel(panel, props)}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
