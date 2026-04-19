import { TrendRow } from "./TrendRow";
import type { TrendEntry } from "./TrendRow";

interface TrendSectionProps {
  title: string;
  entries: TrendEntry[];
  testId?: string;
}

export function TrendSection({ title, entries, testId }: TrendSectionProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      className="bg-dt-bg1 border border-dt-border rounded-dt p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-md font-semibold text-dt-text2 font-mono tracking-wide">{title}</span>
        <div className="flex items-center gap-4 text-xxs font-mono text-dt-text2">
          <span className="flex items-center gap-1.5">
            <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden="true">
              <line x1="0" y1="2" x2="12" y2="2" stroke="var(--dt-teal)" strokeWidth="1.5" />
            </svg>
            In
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="12"
                y2="2"
                stroke="var(--dt-purple)"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </svg>
            Out
          </span>
        </div>
      </div>
      {entries.length === 0 ? (
        <div data-testid="trend-section-empty" className="text-xs font-mono text-dt-text2 py-2">
          No data in this period
        </div>
      ) : (
        <div className="flex flex-col">
          {entries.map((entry) => (
            <TrendRow key={entry.name} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
