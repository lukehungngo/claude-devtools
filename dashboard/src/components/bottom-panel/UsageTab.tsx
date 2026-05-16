import { useContext, useEffect, useState } from "react";
import type { LiveContextUsage, PerModelUsage, UsageBreakdown } from "../../lib/usage-types";
import { formatCost, formatTokens } from "../../lib/cost";
import { LayoutContext } from "../../contexts/LayoutContext";

type LiveLoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: LiveContextUsage }
  | { kind: "fallback" }
  | { kind: "error"; message: string };

type FallbackLoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: UsageBreakdown }
  | { kind: "error"; message: string };

interface UsageTabProps {
  /**
   * When provided, the tab attempts the rich SDK breakdown via
   * `/api/sessions/:sessionId/context-usage`. On null (non-live session) it
   * falls back to the JSONL `/api/usage/breakdown` aggregator.
   */
  sessionId?: string;
  /**
   * Bug H — when set, render ONLY the JSONL fallback path and scope the
   * `/api/usage/breakdown` request to this turn's timestamp range. The SDK
   * live `/context-usage` path is skipped entirely (whole-session by design
   * — cannot give "context as of turn N") and the SDK-rich sections (MCP /
   * agents / skills / slash-commands / message breakdown) are hidden.
   */
  effectiveScopeTurn?: number;
  /** Bug H — ISO-8601 lower bound (inclusive) for the turn's event window. */
  scopeFromTs?: string;
  /** Bug H — ISO-8601 upper bound (exclusive) for the turn's event window. */
  scopeToTs?: string;
}

/**
 * Token usage breakdown.
 *
 * - Live sessions (R-3): fetches `query.getContextUsage()` via
 *   `/api/sessions/:sessionId/context-usage` and renders the authoritative
 *   per-MCP / per-agent / skills / slash-commands / messages breakdown
 *   plus the SDK's autoCompactThreshold (R-4 — also published into
 *   LayoutContext for ContextWarningBanner).
 * - Historical / cold sessions: falls back to per-model + cache-hit ratio
 *   from `/api/usage/breakdown`.
 * - Turn-scoped (Bug H): when `effectiveScopeTurn` is provided, the SDK
 *   live path is bypassed entirely (the SDK has no concept of "context as
 *   of turn N") and the fallback aggregator is scoped to the turn's
 *   `[scopeFromTs, scopeToTs)` window. Header reads "Turn N usage" and the
 *   SDK-rich sections are hidden.
 */
export function UsageTab({
  sessionId,
  effectiveScopeTurn,
  scopeFromTs,
  scopeToTs,
}: UsageTabProps = {}): JSX.Element {
  const layoutCtx = useContext(LayoutContext);
  const setAutoCompactThreshold = layoutCtx?.setAutoCompactThreshold;

  // Bug H — turn-scoped mode. Skip the SDK live path entirely (it's whole-
  // session by design) and render only the per-turn fallback view.
  const isTurnScoped =
    effectiveScopeTurn !== undefined &&
    typeof scopeFromTs === "string" &&
    typeof scopeToTs === "string";

  const [liveState, setLiveState] = useState<LiveLoadState>(
    isTurnScoped
      ? { kind: "fallback" }
      : sessionId
        ? { kind: "loading" }
        : { kind: "fallback" },
  );

  // Fetch live SDK context-usage when a sessionId is supplied and we are NOT
  // turn-scoped. Bug H — the SDK only knows "now," so for turn-scoped views
  // we skip this fetch entirely (avoids both wasted I/O and the brief flash
  // of SDK content before the fallback takes over).
  useEffect(() => {
    if (isTurnScoped) {
      setLiveState({ kind: "fallback" });
      return;
    }
    if (!sessionId) {
      setLiveState({ kind: "fallback" });
      return;
    }
    let cancelled = false;
    setLiveState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/context-usage`);
        if (!res.ok) {
          if (!cancelled) setLiveState({ kind: "fallback" });
          return;
        }
        const body = (await res.json()) as { usage?: LiveContextUsage | null };
        if (cancelled) return;
        if (body.usage) {
          setLiveState({ kind: "ready", data: body.usage });
          if (
            setAutoCompactThreshold &&
            typeof body.usage.autoCompactThreshold === "number"
          ) {
            setAutoCompactThreshold(body.usage.autoCompactThreshold);
          }
        } else {
          setLiveState({ kind: "fallback" });
        }
      } catch {
        if (!cancelled) setLiveState({ kind: "fallback" });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, setAutoCompactThreshold, isTurnScoped]);

  if (liveState.kind === "loading") {
    return (
      <div className="p-3 t-mono-sm" style={{ color: "var(--t3)" }}>
        Loading usage breakdown…
      </div>
    );
  }
  if (liveState.kind === "error") {
    return (
      <div className="p-3 t-mono-sm" style={{ color: "var(--err)" }}>
        {liveState.message}
      </div>
    );
  }
  if (liveState.kind === "ready") {
    return <LiveBreakdown data={liveState.data} />;
  }
  // fallback → historical /api/usage/breakdown view (legacy behavior).
  // Pass sessionId so the server scopes aggregation to this session — without
  // it the endpoint returns account-wide totals (every project on disk),
  // which surfaces as wildly inflated cost in the per-session Usage tab.
  // When turn-scoped, also pass the [fromTs, toTs) window so the server
  // aggregates only that turn's events.
  return (
    <FallbackBreakdown
      sessionId={sessionId}
      turnNumber={isTurnScoped ? effectiveScopeTurn : undefined}
      fromTs={isTurnScoped ? scopeFromTs : undefined}
      toTs={isTurnScoped ? scopeToTs : undefined}
    />
  );
}

interface FallbackBreakdownProps {
  sessionId?: string;
  /** Bug H — when set, header reads "Turn N usage" instead of "Per-model usage". */
  turnNumber?: number;
  /** Bug H — half-open [fromTs, toTs) window forwarded to the server. */
  fromTs?: string;
  toTs?: string;
}

function FallbackBreakdown({
  sessionId,
  turnNumber,
  fromTs,
  toTs,
}: FallbackBreakdownProps = {}): JSX.Element {
  const [state, setState] = useState<FallbackLoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (sessionId) params.set("sessionId", sessionId);
        if (fromTs) params.set("fromTs", fromTs);
        if (toTs) params.set("toTs", toTs);
        const qs = params.toString();
        const url = qs
          ? `/api/usage/breakdown?${qs}`
          : "/api/usage/breakdown";
        const res = await fetch(url);
        if (!res.ok) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: `Failed to load usage breakdown (${res.status})`,
            });
          }
          return;
        }
        const body = (await res.json()) as { breakdown?: UsageBreakdown };
        if (!cancelled) {
          const data = body.breakdown ?? { perModel: [], totalCost: 0 };
          setState({ kind: "ready", data });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "unknown error";
          setState({ kind: "error", message: `Failed to load usage breakdown: ${message}` });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, fromTs, toTs]);

  if (state.kind === "loading") {
    return (
      <div className="p-3 t-mono-sm" style={{ color: "var(--t3)" }}>
        Loading usage breakdown…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="p-3 t-mono-sm" style={{ color: "var(--err)" }}>
        {state.message}
      </div>
    );
  }

  const { perModel, totalCost } = state.data;
  if (perModel.length === 0) {
    return (
      <div className="p-3 t-mono-sm" style={{ color: "var(--t3)" }}>
        No usage data available yet.
      </div>
    );
  }

  // Bug H — header label switches between whole-session and per-turn mode.
  const headerLabel =
    turnNumber !== undefined ? `Turn ${turnNumber} usage` : "Per-model usage";

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-3 py-2 t-mono-xs"
        style={{ color: "var(--t3)", borderBottom: "1px solid var(--bd)" }}
      >
        <span>{headerLabel}</span>
        <span>Total cost: {formatCost(totalCost)}</span>
      </div>
      <div className="overflow-y-auto flex-1">
        <table className="w-full t-mono-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--t3)", background: "var(--bg-h)" }}>
              <th className="text-left px-2 py-1 font-normal">Model</th>
              <th className="text-right px-2 py-1 font-normal">Input</th>
              <th className="text-right px-2 py-1 font-normal">Output</th>
              <th className="text-right px-2 py-1 font-normal">Cache create</th>
              <th className="text-right px-2 py-1 font-normal">Cache read</th>
              <th className="text-left px-2 py-1 font-normal">Cache hit</th>
              <th className="text-right px-2 py-1 font-normal">Cost</th>
            </tr>
          </thead>
          <tbody>
            {perModel.map((row) => (
              <UsageRow key={row.model} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface UsageRowProps {
  row: PerModelUsage;
}

function UsageRow({ row }: UsageRowProps): JSX.Element {
  const pct = Math.round(row.cacheHitRatio * 100);
  return (
    <tr
      data-testid={`usage-row-${row.model}`}
      style={{ borderBottom: "1px solid var(--bd)", color: "var(--t1)" }}
    >
      <td className="px-2 py-1">{row.model}</td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>{formatTokens(row.inputTokens)}</td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>{formatTokens(row.outputTokens)}</td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>{formatTokens(row.cacheCreationTokens)}</td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>{formatTokens(row.cacheReadTokens)}</td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-2" style={{ minWidth: 120 }}>
          <div
            className="flex-1"
            style={{
              position: "relative",
              height: 6,
              background: "var(--bg-h)",
              border: "1px solid var(--bd)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              data-testid={`cache-hit-bar-${row.model}`}
              style={{ width: `${pct}%`, height: "100%", background: "var(--acc)", transition: "width .2s" }}
            />
          </div>
          <span className="t-mono-xs" style={{ color: "var(--t2)", minWidth: 36, textAlign: "right" }}>
            {pct}%
          </span>
        </div>
      </td>
      <td className="px-2 py-1 text-right" style={{ color: "var(--t2)" }}>{formatCost(row.totalCost)}</td>
    </tr>
  );
}

interface LiveBreakdownProps {
  data: LiveContextUsage;
}

function LiveBreakdown({ data }: LiveBreakdownProps): JSX.Element {
  const thresholdPct =
    typeof data.autoCompactThreshold === "number"
      ? Math.round(data.autoCompactThreshold * 100)
      : null;
  const percent = Math.round(data.percentage);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header — total + autoCompactThreshold (R-4) */}
      <div
        className="px-3 py-2 t-mono-xs flex items-center justify-between"
        style={{ color: "var(--t3)", borderBottom: "1px solid var(--bd)" }}
      >
        <span>
          {data.model} — {formatTokens(data.totalTokens)} / {formatTokens(data.maxTokens)} ({percent}%)
        </span>
        {thresholdPct !== null && (
          <span data-testid="auto-compact-threshold">
            Autocompact threshold: {thresholdPct}%
          </span>
        )}
      </div>

      {/* MCP tools */}
      <Section title="MCP servers" testid="usage-section-mcp">
        {data.mcpTools.length === 0 ? (
          <EmptyRow text="No MCP tools loaded" />
        ) : (
          <ul className="t-mono-sm">
            {data.mcpTools.map((t) => (
              <KvRow
                key={`${t.serverName}:${t.name}`}
                label={`${t.serverName} / ${t.name}`}
                value={formatTokens(t.tokens)}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* Agents */}
      <Section title="Agents" testid="usage-section-agents">
        {data.agents.length === 0 ? (
          <EmptyRow text="No agents loaded" />
        ) : (
          <ul className="t-mono-sm">
            {data.agents.map((a) => (
              <KvRow
                key={`${a.source}:${a.agentType}`}
                label={`${a.agentType} (${a.source})`}
                value={formatTokens(a.tokens)}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* Skills */}
      <Section title="Skills" testid="usage-section-skills">
        {data.skills ? (
          <ul className="t-mono-sm">
            <KvRow
              label={`Loaded ${data.skills.includedSkills} / ${data.skills.totalSkills}`}
              value={formatTokens(data.skills.tokens)}
            />
          </ul>
        ) : (
          <EmptyRow text="No skills metadata" />
        )}
      </Section>

      {/* Slash commands */}
      <Section title="Slash commands" testid="usage-section-slash-commands">
        {data.slashCommands ? (
          <ul className="t-mono-sm">
            <KvRow
              label={`Loaded ${data.slashCommands.includedCommands} / ${data.slashCommands.totalCommands}`}
              value={formatTokens(data.slashCommands.tokens)}
            />
          </ul>
        ) : (
          <EmptyRow text="No slash command metadata" />
        )}
      </Section>

      {/* Message breakdown */}
      <Section title="Message breakdown" testid="usage-section-message-breakdown">
        {data.messageBreakdown ? (
          <ul className="t-mono-sm">
            <KvRow
              testid="msg-bd-tool-calls"
              label="Tool calls"
              value={formatTokens(data.messageBreakdown.toolCallTokens)}
            />
            <KvRow
              testid="msg-bd-tool-results"
              label="Tool results"
              value={formatTokens(data.messageBreakdown.toolResultTokens)}
            />
            <KvRow
              testid="msg-bd-attachments"
              label="Attachments"
              value={formatTokens(data.messageBreakdown.attachmentTokens)}
            />
            <KvRow
              testid="msg-bd-assistant"
              label="Assistant messages"
              value={formatTokens(data.messageBreakdown.assistantMessageTokens)}
            />
            <KvRow
              testid="msg-bd-user"
              label="User messages"
              value={formatTokens(data.messageBreakdown.userMessageTokens)}
            />
            <KvRow
              testid="msg-bd-unattributed"
              label="Unattributed"
              value={formatTokens(data.messageBreakdown.unattributedTokens)}
            />
          </ul>
        ) : (
          <EmptyRow text="No message breakdown" />
        )}
      </Section>
    </div>
  );
}

interface SectionProps {
  title: string;
  testid: string;
  children: React.ReactNode;
}

function Section({ title, testid, children }: SectionProps): JSX.Element {
  return (
    <section
      data-testid={testid}
      style={{ borderBottom: "1px solid var(--bd)" }}
    >
      <header
        className="px-3 py-1 t-mono-xs"
        style={{ color: "var(--t3)", background: "var(--bg-h)" }}
      >
        {title}
      </header>
      <div className="px-3 py-1">{children}</div>
    </section>
  );
}

interface KvRowProps {
  label: string;
  value: string;
  testid?: string;
}

function KvRow({ label, value, testid }: KvRowProps): JSX.Element {
  return (
    <li
      className="flex items-center justify-between py-0.5"
      style={{ color: "var(--t1)" }}
      data-testid={testid}
    >
      <span>{label}</span>
      <span style={{ color: "var(--t2)" }}>{value}</span>
    </li>
  );
}

interface EmptyRowProps {
  text: string;
}

function EmptyRow({ text }: EmptyRowProps): JSX.Element {
  return (
    <div className="t-mono-xs" style={{ color: "var(--t3)" }}>
      {text}
    </div>
  );
}
