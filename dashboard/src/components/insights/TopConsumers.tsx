import { formatCost } from "../../lib/cost";

interface TopRepo {
  slug: string;
  tokens: number;
  cost: number;
}

interface TopSession {
  id: string;
  label: string;
  cost: number;
}

interface TopTool {
  name: string;
  calls: number;
}

interface TopConsumersProps {
  topRepos: TopRepo[];
  topSessions: TopSession[];
  topTools: TopTool[];
}

interface RankColumnProps<T> {
  testId: string;
  title: string;
  items: T[];
  rowTestIdPrefix: string;
  barTestIdPrefix: string;
  getKey: (item: T, i: number) => string;
  getLabel: (item: T) => string;
  getValue: (item: T) => number;
  formatValue: (item: T) => string;
}

function RankColumn<T>({
  testId,
  title,
  items,
  rowTestIdPrefix,
  barTestIdPrefix,
  getKey,
  getLabel,
  getValue,
  formatValue,
}: RankColumnProps<T>): JSX.Element {
  const maxValue = items.length > 0 ? getValue(items[0]) : 1;

  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      <span className="text-xxs font-mono text-dt-text2 uppercase tracking-wide">{title}</span>
      {items.length === 0 ? (
        <span className="text-xs font-mono text-dt-text2">No data</span>
      ) : (
        items.map((item, i) => (
          <div
            key={getKey(item, i)}
            data-testid={`${rowTestIdPrefix}-${i}`}
            className="flex flex-col gap-0.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-dt-text0 truncate flex-1">{getLabel(item)}</span>
              <span className="text-xs font-mono text-dt-text2 flex-shrink-0 tabular-nums">{formatValue(item)}</span>
            </div>
            <div className="h-1 bg-dt-bg2 rounded overflow-hidden">
              <div
                data-testid={`${barTestIdPrefix}-${i}`}
                className="h-full bg-dt-accent opacity-60 rounded"
                style={{ width: `${maxValue > 0 ? (getValue(item) / maxValue) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function TopConsumers({ topRepos, topSessions, topTools }: TopConsumersProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <RankColumn
        testId="col-repos"
        title="Top repos"
        items={topRepos}
        rowTestIdPrefix="repo-row"
        barTestIdPrefix="repo-bar"
        getKey={(r) => r.slug}
        getLabel={(r) => r.slug.split("/").pop() ?? r.slug}
        getValue={(r) => r.cost}
        formatValue={(r) => formatCost(r.cost)}
      />
      <RankColumn
        testId="col-sessions"
        title="Top sessions"
        items={topSessions}
        rowTestIdPrefix="session-row"
        barTestIdPrefix="session-bar"
        getKey={(_, i) => String(i)}
        getLabel={(s) => s.label}
        getValue={(s) => s.cost}
        formatValue={(s) => formatCost(s.cost)}
      />
      <RankColumn
        testId="col-tools"
        title="Top tools"
        items={topTools}
        rowTestIdPrefix="tool-row"
        barTestIdPrefix="tool-bar"
        getKey={(t) => t.name}
        getLabel={(t) => t.name}
        getValue={(t) => t.calls}
        formatValue={(t) => String(t.calls)}
      />
    </div>
  );
}
