import { useState, useEffect, useCallback, useId } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Plus, X } from "lucide-react";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface DailyPoint {
  date: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

interface Milestone {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  color: string;
}

export interface TokenTrendChartProps {
  daily?: DailyPoint[];
  loading?: boolean;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const LS_KEY = "dt-tool-milestones";

const PRESET_COLORS: { name: string; value: string; bg: string }[] = [
  { name: "blue", value: "blue", bg: "#3B82F6" },
  { name: "green", value: "green", bg: "#22C55E" },
  { name: "orange", value: "orange", bg: "#F97316" },
  { name: "purple", value: "purple", bg: "#A855F7" },
  { name: "red", value: "red", bg: "#EF4444" },
];

// ──────────────────────────────────────────────
// localStorage helpers
// ──────────────────────────────────────────────

function loadMilestones(): Milestone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Milestone[];
  } catch {
    return [];
  }
}

function saveMilestones(milestones: Milestone[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(milestones));
  } catch {
    // Quota exceeded or storage disabled — silently ignore
  }
}

// ──────────────────────────────────────────────
// Milestone swimlanes
// ──────────────────────────────────────────────

interface MilestoneBandProps {
  milestone: Milestone;
  daily: DailyPoint[];
  onDelete: (id: string) => void;
}

function colorToBg(color: string): string {
  const found = PRESET_COLORS.find((c) => c.value === color);
  return found?.bg ?? "#3B82F6";
}

function MilestoneBand({ milestone, daily, onDelete }: MilestoneBandProps): JSX.Element {
  const bg = colorToBg(milestone.color);

  // Compute position as percentage of date range
  let leftPct = 0;
  let widthPct = 10; // fallback width

  if (daily.length > 0) {
    const dates = daily.map((d) => d.date);
    const first = dates[0];
    const last = dates[dates.length - 1];
    const totalMs = new Date(last).getTime() - new Date(first).getTime() || 1;

    const startMs = Math.max(
      new Date(milestone.startDate).getTime() - new Date(first).getTime(),
      0
    );
    const endMs = milestone.endDate
      ? Math.min(
          new Date(milestone.endDate).getTime() - new Date(first).getTime(),
          totalMs
        )
      : startMs + totalMs / Math.max(dates.length - 1, 1);

    leftPct = Math.min((startMs / totalMs) * 100, 100);
    widthPct = Math.min(Math.max(((endMs - startMs) / totalMs) * 100, 2), 100 - leftPct);
  }

  return (
    <div
      data-testid={`milestone-band-${milestone.id}`}
      className="relative flex items-center"
      style={{ height: 28, marginBottom: 4 }}
    >
      {/* Full-width track */}
      <div
        className="absolute inset-0 rounded"
        style={{ background: "var(--border)", opacity: 0.3 }}
      />
      {/* Colored band */}
      <div
        className="absolute top-0 bottom-0 rounded opacity-70"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          background: bg,
        }}
      />
      {/* Label */}
      <span
        className="relative z-10 ml-2 text-sm font-mono font-semibold text-dt-text0 truncate flex-1"
        style={{ maxWidth: "calc(100% - 48px)" }}
      >
        {milestone.name}
      </span>
      {/* Delete button */}
      <button
        type="button"
        data-testid={`milestone-delete-${milestone.id}`}
        aria-label={`Delete milestone ${milestone.name}`}
        onClick={() => onDelete(milestone.id)}
        className="relative z-10 ml-auto mr-1 flex items-center justify-center text-dt-text2 hover:text-dt-red rounded transition-colors"
        style={{ width: 20, height: 20, background: "transparent", border: "none", cursor: "pointer" }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Add milestone inline form
// ──────────────────────────────────────────────

interface MilestoneFormValues {
  name: string;
  startDate: string;
  endDate: string;
  color: string;
}

interface AddMilestoneFormProps {
  onAdd: (m: Milestone) => void;
  onCancel: () => void;
}

function AddMilestoneForm({ onAdd, onCancel }: AddMilestoneFormProps): JSX.Element {
  const nameId = useId();
  const [values, setValues] = useState<MilestoneFormValues>({
    name: "",
    startDate: "",
    endDate: "",
    color: "blue",
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (!values.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!values.startDate) {
      setError("Start date is required");
      return;
    }
    setError(null);
    const milestone: Milestone = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: values.name.trim(),
      startDate: values.startDate,
      endDate: values.endDate || null,
      color: values.color,
    };
    onAdd(milestone);
  }, [values, onAdd]);

  return (
    <div
      data-testid="milestone-form"
      className="bg-dt-bg0 border border-dt-border rounded-dt mt-2"
      style={{ padding: "12px 14px" }}
    >
      <div className="flex flex-col gap-2.5">
        {/* Name */}
        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className="text-sm font-mono font-bold text-dt-text2 uppercase tracking-wider">
            Name
          </label>
          <input
            id={nameId}
            data-testid="milestone-name-input"
            type="text"
            placeholder="e.g. Deployed new tool"
            value={values.name}
            onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
            className="bg-dt-bg1 border border-dt-border rounded-dt text-sm font-mono text-dt-text0 px-2 py-1 focus:outline-none focus:border-dt-accent"
          />
        </div>

        {/* Date range */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm font-mono font-bold text-dt-text2 uppercase tracking-wider">
              Start date
            </label>
            <input
              data-testid="milestone-start-date-input"
              type="date"
              value={values.startDate}
              onChange={(e) => setValues((prev) => ({ ...prev, startDate: e.target.value }))}
              className="bg-dt-bg1 border border-dt-border rounded-dt text-sm font-mono text-dt-text0 px-2 py-1 focus:outline-none focus:border-dt-accent"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm font-mono font-bold text-dt-text2 uppercase tracking-wider">
              End date <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              data-testid="milestone-end-date-input"
              type="date"
              value={values.endDate}
              onChange={(e) => setValues((prev) => ({ ...prev, endDate: e.target.value }))}
              className="bg-dt-bg1 border border-dt-border rounded-dt text-sm font-mono text-dt-text0 px-2 py-1 focus:outline-none focus:border-dt-accent"
            />
          </div>
        </div>

        {/* Color picker */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-mono font-bold text-dt-text2 uppercase tracking-wider">
            Color
          </span>
          <div className="flex gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                data-testid={`milestone-color-${c.value}`}
                aria-label={`Select color ${c.name}`}
                aria-pressed={values.color === c.value}
                onClick={() => setValues((prev) => ({ ...prev, color: c.value }))}
                className="rounded-full transition-all"
                style={{
                  width: 20,
                  height: 20,
                  background: c.bg,
                  border: values.color === c.value ? "2px solid var(--text-0)" : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div data-testid="milestone-form-error" className="text-sm font-mono text-dt-red">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-0.5">
          <button
            type="button"
            data-testid="milestone-submit-btn"
            onClick={handleSubmit}
            className="text-sm font-mono font-semibold px-3 py-1 rounded-dt bg-dt-accent text-white hover:opacity-90 transition-opacity"
            style={{ border: "none", cursor: "pointer" }}
          >
            Add
          </button>
          <button
            type="button"
            data-testid="milestone-cancel-btn"
            onClick={onCancel}
            className="text-sm font-mono font-semibold px-3 py-1 rounded-dt text-dt-text2 hover:text-dt-text1 transition-colors"
            style={{ border: "none", background: "transparent", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Custom tooltip for recharts
// ──────────────────────────────────────────────

interface CustomTooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps): JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dt-bg1 border border-dt-border rounded-dt px-3 py-2 shadow">
      <div className="text-sm font-mono font-semibold text-dt-text0 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="text-sm font-mono" style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString()}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────

export function TokenTrendChart({ daily, loading = false }: TokenTrendChartProps): JSX.Element {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Load milestones from localStorage on mount
  useEffect(() => {
    setMilestones(loadMilestones());
  }, []);

  const handleAddMilestone = useCallback((m: Milestone) => {
    setMilestones((prev) => {
      const updated = [...prev, m];
      saveMilestones(updated);
      return updated;
    });
    setShowForm(false);
  }, []);

  const handleDeleteMilestone = useCallback((id: string) => {
    setMilestones((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      saveMilestones(updated);
      return updated;
    });
  }, []);

  const hasData = Array.isArray(daily) && daily.length > 0;

  // Chart data — recharts expects array of objects
  const chartData = daily && daily.length > 0
    ? daily.map((d) => ({
        date: d.date.slice(5), // "MM-DD"
        tokensIn: d.tokensIn,
      }))
    : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Chart area */}
      {loading ? (
        <div
          data-testid="token-trend-loading"
          className="h-28 rounded-dt bg-dt-bg2 animate-pulse"
        />
      ) : !hasData ? (
        <div
          data-testid="token-trend-empty"
          className="h-28 flex items-center justify-center text-dt-text2 text-sm font-mono"
        >
          No token data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 0, bottom: 20, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "var(--text-2)", fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="tokensIn"
              name="Tokens In"
              stroke="var(--teal)"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Milestone swimlanes section */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-mono font-bold uppercase tracking-wider text-dt-text2">
            Tool milestones
          </span>
          <button
            type="button"
            data-testid="add-milestone-btn"
            aria-label="Add tool milestone"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 text-sm font-mono text-dt-text2 hover:text-dt-text1 transition-colors ml-auto"
            style={{ border: "none", background: "transparent", cursor: "pointer" }}
          >
            <Plus size={13} />
            Add milestone
          </button>
        </div>

        {/* Inline form */}
        {showForm && (
          <AddMilestoneForm
            onAdd={handleAddMilestone}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Milestone bands */}
        {milestones.length === 0 ? (
          <div
            data-testid="milestones-empty"
            className="text-sm font-mono text-dt-text2 py-2"
          >
            Add a tool milestone to track its impact on token usage
          </div>
        ) : (
          <div className="flex flex-col" style={{ paddingTop: 4 }}>
            {milestones.map((m) => (
              <MilestoneBand
                key={m.id}
                milestone={m}
                daily={daily ?? []}
                onDelete={handleDeleteMilestone}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
