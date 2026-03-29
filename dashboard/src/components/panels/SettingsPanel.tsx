import type { SessionMetrics, UsageInfo } from "../../lib/types";

interface SettingsPanelProps {
  metrics: SessionMetrics | null;
  usage: UsageInfo | null;
}

interface SettingRowProps {
  label: string;
  value: string | number | null | undefined;
}

function SettingRow({ label, value }: SettingRowProps) {
  return (
    <div className="flex justify-between items-center py-2 px-4 hover:bg-dt-bg3/30 transition-colors duration-100 rounded-dt-xs mx-1">
      <span className="text-dt-text2 text-sm">{label}</span>
      <span className="text-dt-text0 font-mono text-sm">
        {value ?? "--"}
      </span>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <h3 className="text-xs font-bold text-dt-text2 uppercase tracking-wider px-4 pt-4 pb-1.5 border-b border-dt-border/30 mx-1 mb-1">
      {title}
    </h3>
  );
}

export function SettingsPanel({ metrics, usage }: SettingsPanelProps) {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
        Select a session to view settings
      </div>
    );
  }

  const model = metrics.models.length > 0 ? metrics.models[0] : null;
  const permissionMode = metrics.permissionMode ?? metrics.session.permissionMode ?? null;
  const cwd = metrics.session.cwd ?? null;
  const gitBranch = metrics.session.gitBranch ?? null;
  const contextPercent = metrics.contextPercent;
  const repoConfig = metrics.repoConfig;

  return (
    <div className="flex flex-col overflow-y-auto h-full py-2">
      <SectionHeader title="Session" />
      <SettingRow label="Model" value={model} />
      <SettingRow label="Permission Mode" value={permissionMode} />
      <SettingRow label="Working Directory" value={cwd} />
      <SettingRow label="Git Branch" value={gitBranch} />
      <div className="flex justify-between items-center py-2 px-4 mx-1">
        <span className="text-dt-text2 text-sm">Context Window</span>
        <div className="flex items-center gap-2.5">
          <div className="w-24 h-1.5 bg-dt-bg3 rounded-full overflow-hidden">
            <div
              className="h-full bg-dt-accent rounded-full transition-all duration-300"
              style={{ width: `${Math.min(contextPercent, 100)}%` }}
            />
          </div>
          <span className="text-dt-text0 font-mono text-sm">{contextPercent}%</span>
        </div>
      </div>

      <SectionHeader title="Configuration" />
      <SettingRow label="CLAUDE.md Files" value={repoConfig?.claudeMdFiles ?? "--"} />
      <SettingRow label="Rules" value={repoConfig?.rules ?? "--"} />
      <SettingRow label="Agents" value={repoConfig?.agents ?? "--"} />
      <SettingRow label="Hooks" value={repoConfig?.hooks ?? "--"} />

      {usage && (
        <>
          <SectionHeader title="API Key" />
          <SettingRow label="Plan" value={usage.planName} />
          {usage.fiveHour.utilization != null && (
            <div className="flex justify-between items-center py-2 px-4 mx-1">
              <span className="text-dt-text2 text-sm">Session Utilization</span>
              <div className="flex items-center gap-2.5">
                <div className="w-24 h-1.5 bg-dt-bg3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-dt-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(usage.fiveHour.utilization * 100, 100)}%` }}
                  />
                </div>
                <span className="text-dt-text0 font-mono text-sm">
                  {Math.round(usage.fiveHour.utilization * 100)}%
                </span>
              </div>
            </div>
          )}
          {usage.sevenDay.utilization != null && (
            <div className="flex justify-between items-center py-2 px-4 mx-1">
              <span className="text-dt-text2 text-sm">Weekly Utilization</span>
              <div className="flex items-center gap-2.5">
                <div className="w-24 h-1.5 bg-dt-bg3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-dt-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(usage.sevenDay.utilization * 100, 100)}%` }}
                  />
                </div>
                <span className="text-dt-text0 font-mono text-sm">
                  {Math.round(usage.sevenDay.utilization * 100)}%
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
