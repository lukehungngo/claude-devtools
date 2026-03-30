import { useState, useCallback, useRef } from "react";

export type BottomTab = "trace" | "detail" | "raw" | "live" | "history" | "cost";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "trace", label: "Trace" },
  { id: "detail", label: "Detail" },
  { id: "raw", label: "Raw" },
  { id: "live", label: "Live" },
  { id: "history", label: "History" },
  { id: "cost", label: "Cost" },
];

interface BottomPanelProps {
  detailCount?: number;
  children?: React.ReactNode;
}

export function BottomPanel({ detailCount }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>("trace");
  const [panelHeight, setPanelHeight] = useState(220);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartRef.current = { y: e.clientY, height: panelHeight };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return;
        const delta = dragStartRef.current.y - ev.clientY;
        const newHeight = Math.max(80, Math.min(600, dragStartRef.current.height + delta));
        setPanelHeight(newHeight);
        setIsCollapsed(false);
      };

      const handleMouseUp = () => {
        dragStartRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight],
  );

  const handleDividerDoubleClick = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  return (
    <>
      {/* Resizable divider */}
      <div
        onMouseDown={handleDividerMouseDown}
        onDoubleClick={handleDividerDoubleClick}
        style={{
          height: 3,
          background: "var(--bd)",
          cursor: "row-resize",
          flexShrink: 0,
          transition: "background .15s",
        }}
        className="hover:!bg-[var(--acc)]"
        role="separator"
        aria-label="Resize bottom panel"
      />

      {/* Bottom panel */}
      <div
        className="flex flex-col shrink-0"
        style={{
          background: "var(--bg-s)",
          borderTop: "1px solid var(--bd)",
        }}
      >
        {/* Tab bar */}
        <div
          className="flex shrink-0"
          style={{
            borderBottom: "1px solid var(--bd)",
            background: "var(--bg)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsCollapsed(false);
              }}
              className="flex items-center gap-[5px] cursor-pointer border-none bg-transparent"
              style={{
                padding: "8px 16px",
                fontSize: 11,
                color: activeTab === tab.id ? "var(--acc)" : "var(--t3)",
                borderBottom: `2px solid ${activeTab === tab.id ? "var(--acc)" : "transparent"}`,
                transition: "all .12s",
              }}
            >
              {tab.label}
              {tab.id === "detail" && detailCount !== undefined && detailCount > 0 && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    background: "var(--bg-s)",
                    padding: "1px 6px",
                    borderRadius: 6,
                  }}
                >
                  {detailCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Panel body */}
        {!isCollapsed && (
          <div className="overflow-y-auto dt-scrollbar" style={{ height: panelHeight }}>
            <TabContent tab={activeTab} />
          </div>
        )}
      </div>
    </>
  );
}

function TabContent({ tab }: { tab: BottomTab }) {
  switch (tab) {
    case "trace":
      return <TracePlaceholder />;
    case "detail":
      return <DetailPlaceholder />;
    case "raw":
      return <RawPlaceholder />;
    case "live":
      return <LivePlaceholder />;
    case "history":
      return <HistoryPlaceholder />;
    case "cost":
      return <CostPlaceholder />;
    default:
      return null;
  }
}

function TracePlaceholder() {
  return (
    <div style={{ padding: "10px 16px" }}>
      {/* Time axis ticks */}
      <div className="flex" style={{ marginLeft: 110, marginBottom: 6 }}>
        {["0m", "5m", "10m", "15m", "20m", "25m", "30m", "37m"].map((t) => (
          <span
            key={t}
            className="flex-1 font-mono"
            style={{ fontSize: 9, color: "var(--t3)" }}
          >
            {t}
          </span>
        ))}
      </div>
      {/* Placeholder trace rows */}
      <div className="relative">
        <TraceRow
          indent={0}
          icon="PM"
          name="Orchestrator"
          bgColor="var(--span-pm)"
          textColor="var(--span-pm-t)"
          left="0%"
          width="100%"
          info="171t · 37m"
          cost="$580"
        />
        <div style={{ height: 10 }} />
        <TraceRow
          indent={12}
          icon="S1"
          name="SWE frontend"
          bgColor="var(--span-swe)"
          textColor="var(--span-swe-t)"
          left="10%"
          width="35%"
          info="52t · 14m"
          cost="$198"
        />
        <TraceRow
          indent={12}
          icon="S2"
          name="SWE backend"
          bgColor="var(--span-swe2)"
          textColor="var(--span-swe2-t)"
          left="10%"
          width="30%"
          info="48t · 12m"
          cost="$173"
        />
        <div style={{ height: 10 }} />
        <TraceRow
          indent={12}
          icon="QA"
          name="Tester"
          bgColor="var(--span-qa)"
          textColor="var(--span-qa-t)"
          left="46%"
          width="20%"
          info="28t · 8m"
          cost="$96"
        />
      </div>
    </div>
  );
}

function TraceRow({
  indent,
  icon,
  name,
  bgColor,
  textColor,
  left,
  width,
  info,
  cost,
}: {
  indent: number;
  icon: string;
  name: string;
  bgColor: string;
  textColor: string;
  left: string;
  width: string;
  info: string;
  cost: string;
}) {
  return (
    <div
      className="flex items-center cursor-pointer rounded-[6px] mb-[2px]"
      style={{ height: 40, position: "relative", zIndex: 1, transition: "background .1s" }}
    >
      {/* Label */}
      <div
        className="flex items-center gap-[5px] shrink-0 overflow-hidden"
        style={{ width: 110, paddingRight: 8 }}
      >
        <div style={{ width: indent, flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: "var(--t3)", width: 12, textAlign: "center", flexShrink: 0 }}>
          &#9656;
        </span>
        <div
          className="flex items-center justify-center shrink-0 font-semibold"
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            fontSize: 9,
            background: bgColor,
            color: textColor,
          }}
        >
          {icon}
        </div>
        <div
          className="truncate font-medium"
          style={{ fontSize: 11, color: "var(--t1)" }}
        >
          {name}
        </div>
      </div>

      {/* Track */}
      <div className="flex-1 relative" style={{ height: 26 }}>
        <div
          className="absolute flex items-center gap-[6px] overflow-hidden whitespace-nowrap font-medium"
          style={{
            height: "100%",
            borderRadius: 5,
            padding: "0 10px",
            fontSize: 10,
            left,
            width,
            background: bgColor,
            color: textColor,
            transition: "filter .1s",
          }}
        >
          {info}
          <span
            className="ml-auto"
            style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}
          >
            {cost}
          </span>
        </div>
      </div>
    </div>
  );
}

function DetailPlaceholder() {
  return (
    <div>
      <div
        className="flex items-center gap-2"
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--bd)",
          background: "var(--bg)",
        }}
      >
        <div
          className="flex items-center justify-center font-semibold"
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            fontSize: 9,
            background: "var(--span-swe)",
            color: "var(--span-swe-t)",
          }}
        >
          S1
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>
          SWE frontend &rarr; Read x4
        </div>
        <div className="ml-auto font-mono" style={{ fontSize: 10, color: "var(--t3)" }}>
          4 files · 12s · $2.40
        </div>
      </div>
      {["src/http/server.ts", "src/http/auth.ts", "src/utils/jwt.ts", "src/types/auth.d.ts"].map(
        (path, i) => (
          <div
            key={path}
            className="flex items-center gap-2 cursor-pointer"
            style={{
              padding: "6px 16px",
              borderBottom: "1px solid var(--bd)",
              fontSize: 11,
              transition: "background .1s",
            }}
          >
            <span className="font-mono flex-1" style={{ fontSize: 11, color: "var(--t1)" }}>
              {path}
            </span>
            <span className="font-mono" style={{ fontSize: 10, color: "var(--t3)" }}>
              {[192, 148, 67, 34][i]} ln
            </span>
            <span
              style={{
                fontSize: 9,
                padding: "2px 7px",
                borderRadius: 6,
                background: "var(--teal-bg)",
                color: "var(--teal)",
              }}
            >
              read
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function RawPlaceholder() {
  return (
    <pre
      className="font-mono"
      style={{
        padding: "14px 16px",
        fontSize: 11,
        color: "var(--t2)",
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
      }}
    >
      <span style={{ color: "var(--teal)" }}>&quot;type&quot;</span>:{" "}
      <span style={{ color: "var(--grn)" }}>&quot;tool_use&quot;</span>,{"\n"}
      <span style={{ color: "var(--teal)" }}>&quot;name&quot;</span>:{" "}
      <span style={{ color: "var(--grn)" }}>&quot;Read&quot;</span>,{"\n"}
      <span style={{ color: "var(--teal)" }}>&quot;input&quot;</span>: {"{"}{"\n"}
      {"  "}<span style={{ color: "var(--teal)" }}>&quot;file_path&quot;</span>:{" "}
      <span style={{ color: "var(--grn)" }}>&quot;src/http/server.ts&quot;</span>,{"\n"}
      {"  "}<span style={{ color: "var(--teal)" }}>&quot;offset&quot;</span>:{" "}
      <span style={{ color: "var(--amb)" }}>0</span>,{"\n"}
      {"  "}<span style={{ color: "var(--teal)" }}>&quot;limit&quot;</span>:{" "}
      <span style={{ color: "var(--amb)" }}>500</span>{"\n"}
      {"}"}
    </pre>
  );
}

function LivePlaceholder() {
  const events = [
    { time: "14:31:42", type: "Write", typeClass: "grn", msg: "docs/reports/v4-audit-2026-03-30.md — 258 lines" },
    { time: "14:31:27", type: "Glob", typeClass: "teal", msg: "docs/plans/v4* — 1 file matched" },
    { time: "14:31:26", type: "Glob", typeClass: "teal", msg: "docs/reports/* — 10 files matched" },
    { time: "14:28:15", type: "Bash", typeClass: "pur", msg: "npm test -- --run — exit 0" },
    { time: "14:26:02", type: "Edit", typeClass: "grn", msg: "src/http/auth.ts — 12 lines changed" },
    { time: "14:24:48", type: "Bash", typeClass: "pur", msg: "npm test -- --run — exit 1 (2 failures)" },
    { time: "14:22:30", type: "Read", typeClass: "teal", msg: "src/utils/jwt.ts — 67 lines" },
  ];

  return (
    <div>
      {events.map((ev, i) => (
        <div
          key={i}
          className="flex items-center gap-2"
          style={{
            padding: "6px 16px",
            borderBottom: "1px solid var(--bd)",
            fontSize: 11,
          }}
        >
          <span className="font-mono shrink-0" style={{ fontSize: 10, color: "var(--t3)", width: 50 }}>
            {ev.time}
          </span>
          <span
            className="shrink-0 font-medium"
            style={{
              fontSize: 9,
              padding: "2px 7px",
              borderRadius: 6,
              background: `var(--${ev.typeClass}-bg)`,
              color: `var(--${ev.typeClass})`,
            }}
          >
            {ev.type}
          </span>
          <span
            className="flex-1 truncate"
            style={{ color: "var(--t1)" }}
          >
            {ev.msg}
          </span>
        </div>
      ))}
    </div>
  );
}

function HistoryPlaceholder() {
  const sessions = [
    { date: "14:31 today", id: "b9fc5b5e", prompt: "save to v4 report audit", cost: "$580" },
    { date: "12:08 today", id: "a3e81f22", prompt: "implement hooks display panel", cost: "$58" },
    { date: "08:45 today", id: "7c4d9a01", prompt: "fix agent graph rendering", cost: "$12" },
    { date: "22:10 yday", id: "d1f84c02", prompt: "refactor websocket handler", cost: "$94" },
    { date: "18:30 yday", id: "e9b23a11", prompt: "add cost tracking to MCP server", cost: "$142" },
  ];

  return (
    <div>
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-[10px] cursor-pointer"
          style={{
            padding: "6px 16px",
            borderBottom: "1px solid var(--bd)",
            fontSize: 11,
            transition: "background .1s",
          }}
        >
          <span className="font-mono shrink-0" style={{ fontSize: 10, color: "var(--t3)", width: 72 }}>
            {s.date}
          </span>
          <span className="font-mono shrink-0" style={{ fontSize: 10, color: "var(--t2)", width: 62 }}>
            {s.id}
          </span>
          <span className="flex-1 truncate" style={{ color: "var(--t1)" }}>
            {s.prompt}
          </span>
          <span className="font-mono shrink-0" style={{ fontSize: 10, color: "var(--amb)" }}>
            {s.cost}
          </span>
        </div>
      ))}
    </div>
  );
}

function CostPlaceholder() {
  return (
    <div>
      {/* Cost cards */}
      <div className="flex gap-[10px] flex-wrap" style={{ padding: "12px 16px" }}>
        <CostCard label="Session cost" value="$580.12" valueColor="var(--amb)" sub="171 turns · 368K tokens" />
        <CostCard label="Burn rate" value="$15.68" valueSuffix="/min" sub="▲ 12% vs avg" subColor="var(--red)" />
        <CostCard label="Projected total" value="~$640" sub="at current rate" />
      </div>

      {/* Agent breakdown */}
      <div style={{ padding: "0 16px 12px" }}>
        <AgentCostRow icon="PM" name="Orchestrator" pct={43} cost="$248" bgColor="var(--span-pm)" textColor="var(--span-pm-t)" />
        <AgentCostRow icon="SW" name="Engineer" pct={32} cost="$184" bgColor="var(--span-swe)" textColor="var(--span-swe-t)" />
        <AgentCostRow icon="QA" name="Tester" pct={17} cost="$96" bgColor="var(--span-qa)" textColor="var(--span-qa-t)" />
        <AgentCostRow icon="DC" name="Writer" pct={9} cost="$52" bgColor="var(--span-doc)" textColor="var(--span-doc-t)" />
      </div>
    </div>
  );
}

function CostCard({
  label,
  value,
  valueColor,
  valueSuffix,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
  valueSuffix?: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div
      className="flex-1"
      style={{
        background: "var(--bg)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        minWidth: 90,
      }}
    >
      <div
        className="uppercase"
        style={{ fontSize: 9, color: "var(--t3)", letterSpacing: ".3px", marginBottom: 4 }}
      >
        {label}
      </div>
      <div className="font-mono font-medium" style={{ fontSize: 18, color: valueColor || "var(--t1)" }}>
        {value}
        {valueSuffix && (
          <span style={{ fontSize: 11, color: "var(--t3)" }}>{valueSuffix}</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: subColor || "var(--t3)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function AgentCostRow({
  icon,
  name,
  pct,
  cost,
  bgColor,
  textColor,
}: {
  icon: string;
  name: string;
  pct: number;
  cost: string;
  bgColor: string;
  textColor: string;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: "5px 0",
        borderBottom: "1px solid var(--bd)",
        fontSize: 11,
      }}
    >
      <div
        className="flex items-center justify-center shrink-0 font-semibold"
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          fontSize: 8,
          background: bgColor,
          color: textColor,
        }}
      >
        {icon}
      </div>
      <div className="shrink-0" style={{ color: "var(--t1)", width: 80 }}>{name}</div>
      <div
        className="flex-1 overflow-hidden"
        style={{ height: 7, background: "var(--bd)", borderRadius: 4 }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 4,
            background: bgColor,
          }}
        />
      </div>
      <div className="font-mono shrink-0 text-right" style={{ fontSize: 11, color: "var(--t1)", width: 50 }}>
        {cost}
      </div>
      <div className="font-mono shrink-0 text-right" style={{ fontSize: 10, color: "var(--t3)", width: 32 }}>
        {pct}%
      </div>
    </div>
  );
}
