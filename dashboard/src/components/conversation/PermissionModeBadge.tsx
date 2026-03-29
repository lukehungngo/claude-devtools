import type { PermissionMode } from "./permissionModeTypes";

const MODE_ORDER: PermissionMode[] = ["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"];

/** Cycle to the next permission mode in order: default -> acceptEdits -> plan -> dontAsk -> bypassPermissions -> default */
export function cyclePermissionMode(current: string): PermissionMode {
  const idx = MODE_ORDER.indexOf(current as PermissionMode);
  if (idx === -1) return MODE_ORDER[1]; // unknown -> treat as default, return next
  return MODE_ORDER[(idx + 1) % MODE_ORDER.length];
}

const MODE_COLORS: Record<PermissionMode, string> = {
  default: "bg-dt-bg3 text-dt-text2",
  acceptEdits: "bg-dt-yellow-dim text-dt-yellow",
  plan: "bg-dt-cyan-dim text-dt-cyan",
  dontAsk: "bg-dt-bg3 text-dt-orange",
  bypassPermissions: "bg-dt-red-dim text-dt-red",
};

interface PermissionModeBadgeProps {
  mode: string;
  onModeChange: (newMode: PermissionMode) => void;
}

export function PermissionModeBadge({ mode, onModeChange }: PermissionModeBadgeProps) {
  const normalizedMode = (MODE_ORDER.includes(mode as PermissionMode) ? mode : "default") as PermissionMode;
  const colorClass = MODE_COLORS[normalizedMode];

  return (
    <button
      onClick={() => onModeChange(cyclePermissionMode(normalizedMode))}
      className={`text-sm font-semibold px-2 py-0.5 rounded-dt-xs cursor-pointer border-none ${colorClass}`}
      title={`Permission mode: ${normalizedMode}. Click to cycle (Shift+Tab).`}
    >
      {normalizedMode}
    </button>
  );
}
