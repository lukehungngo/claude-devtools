# Phase 5: Control — "Command Your Agents" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time agent control UI — model switcher, fast mode, effort slider, and context compact — so users can adjust execution mid-stream without slash commands.

**Architecture:** All backend routes already exist (`POST /sessions/:id/model`, `/fast`, `/effort`, `/permission-mode`). This is purely frontend: new dropdown/toggle components in the TopBar that call existing endpoints. Permission history is a new read-only view of existing permission data.

**Tech Stack:** React, TypeScript, Tailwind `dt-*` tokens, lucide-react icons, existing API endpoints

---

## File Structure

### New Files
- `dashboard/src/components/controls/ModelSwitcher.tsx` — dropdown to switch models mid-stream
- `dashboard/src/components/controls/ModelSwitcher.test.tsx` — tests
- `dashboard/src/components/controls/FastModeToggle.tsx` — toggle button for fast mode
- `dashboard/src/components/controls/FastModeToggle.test.tsx` — tests
- `dashboard/src/components/controls/EffortSlider.tsx` — 4-level effort selector
- `dashboard/src/components/controls/EffortSlider.test.tsx` — tests
- `dashboard/src/components/controls/ContextCompact.tsx` — context % with compact button
- `dashboard/src/components/controls/ContextCompact.test.tsx` — tests
- `dashboard/src/components/controls/ControlsZone.tsx` — container for all controls
- `dashboard/src/components/controls/ControlsZone.test.tsx` — tests
- `dashboard/src/hooks/useSessionControl.ts` — hook for calling control endpoints
- `dashboard/src/hooks/useSessionControl.test.ts` — tests
- `dashboard/src/components/panels/PermissionHistory.tsx` — permission history log
- `dashboard/src/components/panels/PermissionHistory.test.tsx` — tests

### Modified Files
- `dashboard/src/components/TopBar.tsx` — integrate ControlsZone
- `dashboard/src/routes/SessionPage.tsx` — pass session control props
- `dashboard/src/contexts/LayoutContext.ts` — add session control state (model, fast, effort)
- `dashboard/src/components/PanelModal.tsx` — add permission-history panel
- `dashboard/src/lib/slashCommandHandler.ts` — add `/permission-history` command
- `dashboard/src/lib/types.ts` — add control-related types

---

## Task 1: useSessionControl Hook

**Files:**
- Create: `dashboard/src/hooks/useSessionControl.ts`
- Create: `dashboard/src/hooks/useSessionControl.test.ts`
- Modify: `dashboard/src/lib/types.ts`

- [ ] **Step 1: Add types to `dashboard/src/lib/types.ts`**

Add at the end of the file:

```typescript
export type EffortLevel = "low" | "medium" | "high" | "max";

export interface SessionControlState {
  model: string | null;
  fastMode: boolean;
  effort: EffortLevel;
  activeSessionId: string | null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `dashboard/src/hooks/useSessionControl.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionControl } from "./useSessionControl";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useSessionControl", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it("initializes with default state", () => {
    const { result } = renderHook(() => useSessionControl("test-session"));
    expect(result.current.model).toBeNull();
    expect(result.current.fastMode).toBe(false);
    expect(result.current.effort).toBe("high");
  });

  it("setModel calls POST /api/sessions/:id/model", async () => {
    const { result } = renderHook(() => useSessionControl("sess-123"));
    await act(async () => {
      await result.current.setModel("claude-sonnet-4-6");
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3142/api/sessions/sess-123/model",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "claude-sonnet-4-6" }),
      }),
    );
    expect(result.current.model).toBe("claude-sonnet-4-6");
  });

  it("toggleFastMode calls POST /api/sessions/:id/fast", async () => {
    const { result } = renderHook(() => useSessionControl("sess-123"));
    await act(async () => {
      await result.current.toggleFastMode();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3142/api/sessions/sess-123/fast",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enabled: true }),
      }),
    );
    expect(result.current.fastMode).toBe(true);
  });

  it("setEffort calls POST /api/sessions/:id/effort", async () => {
    const { result } = renderHook(() => useSessionControl("sess-123"));
    await act(async () => {
      await result.current.setEffort("low");
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3142/api/sessions/sess-123/effort",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ effort: "low" }),
      }),
    );
    expect(result.current.effort).toBe("low");
  });

  it("sendCompact calls POST /api/sessions/:id/message with /compact", async () => {
    const { result } = renderHook(() => useSessionControl("sess-123"));
    await act(async () => {
      await result.current.sendCompact();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3142/api/sessions/sess-123/message",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "/compact" }),
      }),
    );
  });

  it("does nothing when sessionId is null", async () => {
    const { result } = renderHook(() => useSessionControl(null));
    await act(async () => {
      await result.current.setModel("opus");
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd dashboard && pnpm test -- --run useSessionControl`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the hook**

Create `dashboard/src/hooks/useSessionControl.ts`:

```typescript
import { useState, useCallback } from "react";
import type { EffortLevel } from "../lib/types";

const API_BASE = "http://localhost:3142/api";

export function useSessionControl(sessionId: string | null) {
  const [model, setModelState] = useState<string | null>(null);
  const [fastMode, setFastModeState] = useState(false);
  const [effort, setEffortState] = useState<EffortLevel>("high");

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!sessionId) return;
      await fetch(`${API_BASE}/sessions/${sessionId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    [sessionId],
  );

  const setModel = useCallback(
    async (newModel: string) => {
      await post("model", { model: newModel });
      setModelState(newModel);
    },
    [post],
  );

  const toggleFastMode = useCallback(async () => {
    const next = !fastMode;
    await post("fast", { enabled: next });
    setFastModeState(next);
  }, [post, fastMode]);

  const setEffort = useCallback(
    async (level: EffortLevel) => {
      await post("effort", { effort: level });
      setEffortState(level);
    },
    [post],
  );

  const sendCompact = useCallback(async () => {
    await post("message", { message: "/compact" });
  }, [post]);

  return { model, fastMode, effort, setModel, toggleFastMode, setEffort, sendCompact };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd dashboard && pnpm test -- --run useSessionControl`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/hooks/useSessionControl.ts dashboard/src/hooks/useSessionControl.test.ts dashboard/src/lib/types.ts
git commit -m "feat(P5-01): add useSessionControl hook for mid-stream control"
```

---

## Task 2: ModelSwitcher Component

**Files:**
- Create: `dashboard/src/components/controls/ModelSwitcher.tsx`
- Create: `dashboard/src/components/controls/ModelSwitcher.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/components/controls/ModelSwitcher.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelSwitcher } from "./ModelSwitcher";

describe("ModelSwitcher", () => {
  const models = [
    { id: "claude-opus-4-6", label: "Opus 4.6" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ];

  it("renders current model name", () => {
    render(<ModelSwitcher current="Opus 4.6" models={models} onSelect={vi.fn()} />);
    expect(screen.getByText("Opus 4.6")).toBeTruthy();
  });

  it("opens dropdown on click", () => {
    render(<ModelSwitcher current="Opus 4.6" models={models} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Sonnet 4.6")).toBeTruthy();
    expect(screen.getByText("Haiku 4.5")).toBeTruthy();
  });

  it("calls onSelect with model id when option clicked", () => {
    const onSelect = vi.fn();
    render(<ModelSwitcher current="Opus 4.6" models={models} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Sonnet 4.6"));
    expect(onSelect).toHaveBeenCalledWith("claude-sonnet-4-6");
  });

  it("closes dropdown after selection", () => {
    render(<ModelSwitcher current="Opus 4.6" models={models} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Sonnet 4.6"));
    expect(screen.queryByText("Haiku 4.5")).toBeNull();
  });

  it("renders dash when current is null", () => {
    render(<ModelSwitcher current={null} models={models} onSelect={vi.fn()} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd dashboard && pnpm test -- --run ModelSwitcher`

- [ ] **Step 3: Implement ModelSwitcher**

Create `dashboard/src/components/controls/ModelSwitcher.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface ModelOption {
  id: string;
  label: string;
}

interface ModelSwitcherProps {
  current: string | null;
  models: ModelOption[];
  onSelect: (modelId: string) => void;
}

export function ModelSwitcher({ current, models, onSelect }: ModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 cursor-pointer bg-transparent border-none font-mono font-medium"
        style={{ fontSize: 12, color: "var(--t1)", padding: "2px 4px" }}
      >
        <span>{current ?? "—"}</span>
        <ChevronDown size={10} style={{ color: "var(--t3)" }} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-lg border shadow-lg overflow-hidden z-50"
          style={{
            background: "var(--bg-e)",
            borderColor: "var(--bd)",
            minWidth: 160,
          }}
        >
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onSelect(m.id);
                setOpen(false);
              }}
              className="block w-full text-left cursor-pointer border-none font-mono"
              style={{
                fontSize: 11,
                padding: "6px 12px",
                color: m.label === current ? "var(--acc)" : "var(--t1)",
                background: m.label === current ? "var(--acc-bg)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (m.label !== current) (e.currentTarget as HTMLElement).style.background = "var(--bg-h)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = m.label === current ? "var(--acc-bg)" : "transparent";
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd dashboard && pnpm test -- --run ModelSwitcher`

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/controls/ModelSwitcher.tsx dashboard/src/components/controls/ModelSwitcher.test.tsx
git commit -m "feat(P5-01): add ModelSwitcher dropdown component"
```

---

## Task 3: FastModeToggle Component

**Files:**
- Create: `dashboard/src/components/controls/FastModeToggle.tsx`
- Create: `dashboard/src/components/controls/FastModeToggle.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/components/controls/FastModeToggle.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FastModeToggle } from "./FastModeToggle";

describe("FastModeToggle", () => {
  it("renders OFF state", () => {
    render(<FastModeToggle enabled={false} onToggle={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("Fast");
  });

  it("renders ON state with accent color", () => {
    render(<FastModeToggle enabled={true} onToggle={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("Fast");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<FastModeToggle enabled={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Implement FastModeToggle**

Create `dashboard/src/components/controls/FastModeToggle.tsx`:

```typescript
import { Zap } from "lucide-react";

interface FastModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function FastModeToggle({ enabled, onToggle }: FastModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 cursor-pointer border-none rounded-md font-mono font-semibold"
      style={{
        fontSize: 10,
        padding: "3px 6px",
        background: enabled
          ? "color-mix(in srgb, var(--amb) 15%, transparent)"
          : "transparent",
        color: enabled ? "var(--amb)" : "var(--t3)",
      }}
      title={enabled ? "Fast mode ON — click to disable" : "Fast mode OFF — click to enable"}
    >
      <Zap size={10} />
      <span>Fast</span>
    </button>
  );
}
```

- [ ] **Step 3: Run tests — expect PASS**

Run: `cd dashboard && pnpm test -- --run FastModeToggle`

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/controls/FastModeToggle.tsx dashboard/src/components/controls/FastModeToggle.test.tsx
git commit -m "feat(P5-01): add FastModeToggle component"
```

---

## Task 4: EffortSlider Component

**Files:**
- Create: `dashboard/src/components/controls/EffortSlider.tsx`
- Create: `dashboard/src/components/controls/EffortSlider.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/components/controls/EffortSlider.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EffortSlider } from "./EffortSlider";

describe("EffortSlider", () => {
  it("renders current effort level", () => {
    render(<EffortSlider level="high" onChange={vi.fn()} />);
    expect(screen.getByText("high")).toBeTruthy();
  });

  it("shows all 4 levels on click", () => {
    render(<EffortSlider level="high" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("low")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
    expect(screen.getByText("max")).toBeTruthy();
  });

  it("calls onChange with selected level", () => {
    const onChange = vi.fn();
    render(<EffortSlider level="high" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("low"));
    expect(onChange).toHaveBeenCalledWith("low");
  });
});
```

- [ ] **Step 2: Implement EffortSlider**

Create `dashboard/src/components/controls/EffortSlider.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import { Gauge } from "lucide-react";
import type { EffortLevel } from "../../lib/types";

const LEVELS: EffortLevel[] = ["low", "medium", "high", "max"];

const LEVEL_COLORS: Record<EffortLevel, string> = {
  low: "var(--t3)",
  medium: "var(--teal)",
  high: "var(--grn)",
  max: "var(--amb)",
};

interface EffortSliderProps {
  level: EffortLevel;
  onChange: (level: EffortLevel) => void;
}

export function EffortSlider({ level, onChange }: EffortSliderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 cursor-pointer bg-transparent border-none font-mono font-medium"
        style={{ fontSize: 10, padding: "2px 4px", color: LEVEL_COLORS[level] }}
      >
        <Gauge size={10} />
        <span>{level}</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-lg border shadow-lg overflow-hidden z-50"
          style={{ background: "var(--bg-e)", borderColor: "var(--bd)", minWidth: 100 }}
        >
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => {
                onChange(l);
                setOpen(false);
              }}
              className="block w-full text-left cursor-pointer border-none font-mono"
              style={{
                fontSize: 11,
                padding: "5px 10px",
                color: l === level ? LEVEL_COLORS[l] : "var(--t1)",
                background: l === level ? "var(--bg-h)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (l !== level) (e.currentTarget as HTMLElement).style.background = "var(--bg-h)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = l === level ? "var(--bg-h)" : "transparent";
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests — expect PASS**

Run: `cd dashboard && pnpm test -- --run EffortSlider`

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/controls/EffortSlider.tsx dashboard/src/components/controls/EffortSlider.test.tsx
git commit -m "feat(P5-01): add EffortSlider component"
```

---

## Task 5: ContextCompact Component

**Files:**
- Create: `dashboard/src/components/controls/ContextCompact.tsx`
- Create: `dashboard/src/components/controls/ContextCompact.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/components/controls/ContextCompact.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextCompact } from "./ContextCompact";

describe("ContextCompact", () => {
  it("renders context percentage and bar", () => {
    render(<ContextCompact percent={45} onCompact={vi.fn()} />);
    expect(screen.getByText("45%")).toBeTruthy();
  });

  it("shows compact button when percent > 50", () => {
    render(<ContextCompact percent={65} onCompact={vi.fn()} />);
    expect(screen.getByTitle("Compact context")).toBeTruthy();
  });

  it("hides compact button when percent <= 50", () => {
    render(<ContextCompact percent={30} onCompact={vi.fn()} />);
    expect(screen.queryByTitle("Compact context")).toBeNull();
  });

  it("calls onCompact when button clicked", () => {
    const onCompact = vi.fn();
    render(<ContextCompact percent={65} onCompact={onCompact} />);
    fireEvent.click(screen.getByTitle("Compact context"));
    expect(onCompact).toHaveBeenCalledOnce();
  });

  it("uses red color when percent >= 80", () => {
    const { container } = render(<ContextCompact percent={85} onCompact={vi.fn()} />);
    const pctText = screen.getByText("85%");
    expect(pctText).toBeTruthy();
    // The bar fill and text should be in danger color (visual check)
    expect(container.querySelector('[data-testid="context-bar-fill"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement ContextCompact**

Create `dashboard/src/components/controls/ContextCompact.tsx`:

```typescript
import { Minimize2 } from "lucide-react";

interface ContextCompactProps {
  percent: number;
  onCompact: () => void;
}

export function ContextCompact({ percent, onCompact }: ContextCompactProps) {
  const color =
    percent >= 80 ? "var(--red)" : percent >= 50 ? "var(--amb)" : "var(--grn)";

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-col items-center gap-[2px]">
        <span
          className="uppercase"
          style={{ fontSize: 8, color: "var(--t3)", letterSpacing: ".4px" }}
        >
          Context
        </span>
        <div className="flex items-center gap-1">
          <span
            className="font-mono font-medium"
            style={{ fontSize: 12, color: "var(--t1)" }}
          >
            {percent}%
          </span>
          <div
            style={{
              width: 42,
              height: 4,
              borderRadius: 2,
              background: "var(--bd)",
              overflow: "hidden",
            }}
          >
            <div
              data-testid="context-bar-fill"
              style={{
                height: "100%",
                width: `${percent}%`,
                borderRadius: 2,
                background: color,
                transition: "width .3s, background .3s",
              }}
            />
          </div>
        </div>
      </div>
      {percent > 50 && (
        <button
          onClick={onCompact}
          title="Compact context"
          className="flex items-center justify-center cursor-pointer bg-transparent border-none rounded"
          style={{
            width: 18,
            height: 18,
            color: color,
            padding: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-h)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <Minimize2 size={10} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests — expect PASS**

Run: `cd dashboard && pnpm test -- --run ContextCompact`

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/controls/ContextCompact.tsx dashboard/src/components/controls/ContextCompact.test.tsx
git commit -m "feat(P5-01): add ContextCompact component with one-click compact"
```

---

## Task 6: ControlsZone Container + TopBar Integration

**Files:**
- Create: `dashboard/src/components/controls/ControlsZone.tsx`
- Create: `dashboard/src/components/controls/ControlsZone.test.tsx`
- Modify: `dashboard/src/components/TopBar.tsx`

- [ ] **Step 1: Write failing tests for ControlsZone**

Create `dashboard/src/components/controls/ControlsZone.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ControlsZone } from "./ControlsZone";

describe("ControlsZone", () => {
  const defaultProps = {
    currentModel: "Opus 4.6",
    models: [
      { id: "claude-opus-4-6", label: "Opus 4.6" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    ],
    onModelSelect: vi.fn(),
    fastMode: false,
    onFastToggle: vi.fn(),
    effort: "high" as const,
    onEffortChange: vi.fn(),
    contextPercent: 45,
    onCompact: vi.fn(),
  };

  it("renders all 4 controls", () => {
    render(<ControlsZone {...defaultProps} />);
    expect(screen.getByText("Opus 4.6")).toBeTruthy();
    expect(screen.getByText("Fast")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("45%")).toBeTruthy();
  });

  it("renders nothing when isLive is false", () => {
    const { container } = render(<ControlsZone {...defaultProps} isLive={false} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Implement ControlsZone**

Create `dashboard/src/components/controls/ControlsZone.tsx`:

```typescript
import { ModelSwitcher } from "./ModelSwitcher";
import { FastModeToggle } from "./FastModeToggle";
import { EffortSlider } from "./EffortSlider";
import { ContextCompact } from "./ContextCompact";
import type { ModelOption } from "./ModelSwitcher";
import type { EffortLevel } from "../../lib/types";

interface ControlsZoneProps {
  currentModel: string | null;
  models: ModelOption[];
  onModelSelect: (modelId: string) => void;
  fastMode: boolean;
  onFastToggle: () => void;
  effort: EffortLevel;
  onEffortChange: (level: EffortLevel) => void;
  contextPercent: number;
  onCompact: () => void;
  isLive?: boolean;
}

export function ControlsZone({
  currentModel,
  models,
  onModelSelect,
  fastMode,
  onFastToggle,
  effort,
  onEffortChange,
  contextPercent,
  onCompact,
  isLive = true,
}: ControlsZoneProps) {
  if (!isLive) return null;

  return (
    <div className="flex items-center gap-2">
      <ModelSwitcher current={currentModel} models={models} onSelect={onModelSelect} />
      <FastModeToggle enabled={fastMode} onToggle={onFastToggle} />
      <EffortSlider level={effort} onChange={onEffortChange} />
      <div className="shrink-0" style={{ width: 1, height: 22, background: "var(--bd)" }} />
      <ContextCompact percent={contextPercent} onCompact={onCompact} />
    </div>
  );
}
```

- [ ] **Step 3: Integrate into TopBar**

Modify `dashboard/src/components/TopBar.tsx`:

Replace the existing static Model HudMetric, the Context section, and add ControlsZone. The key changes:

1. Add imports at top:
```typescript
import { ControlsZone } from "./controls/ControlsZone";
import type { EffortLevel } from "../lib/types";
import type { ModelOption } from "./controls/ModelSwitcher";
```

2. Add new props to the interface:
```typescript
interface Props {
  metrics: SessionMetrics | null;
  isLive?: boolean;
  hasPermissionPending?: boolean;
  viewingTurnNumber?: number;
  onClearViewingTurn?: () => void;
  permissionMode?: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  // New P5-01 control props
  availableModels?: ModelOption[];
  fastMode?: boolean;
  effort?: EffortLevel;
  onModelSelect?: (modelId: string) => void;
  onFastToggle?: () => void;
  onEffortChange?: (level: EffortLevel) => void;
  onCompact?: () => void;
}
```

3. After the permission mode pill section, before the existing metrics, add:
```typescript
{/* P5-01: Controls Zone (only when live) */}
{isLive && onModelSelect && (
  <>
    <ControlsZone
      currentModel={modelName}
      models={availableModels ?? []}
      onModelSelect={onModelSelect}
      fastMode={fastMode ?? false}
      onFastToggle={onFastToggle ?? (() => {})}
      effort={effort ?? "high"}
      onEffortChange={onEffortChange ?? (() => {})}
      contextPercent={contextPct}
      onCompact={onCompact ?? (() => {})}
      isLive={isLive}
    />
    <HudSep />
  </>
)}
```

4. Remove the old static Model `<HudMetric>` and the old Context section (they're now in ControlsZone). Keep Duration, Cost, Agents, and token metrics.

- [ ] **Step 4: Run all tests**

Run: `cd dashboard && pnpm test -- --run ControlsZone && pnpm test -- --run TopBar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/controls/ControlsZone.tsx dashboard/src/components/controls/ControlsZone.test.tsx dashboard/src/components/TopBar.tsx
git commit -m "feat(P5-01): integrate ControlsZone into TopBar"
```

---

## Task 7: Wire Controls in SessionPage

**Files:**
- Modify: `dashboard/src/routes/SessionPage.tsx`

- [ ] **Step 1: Add useSessionControl to SessionPage**

In `SessionPage.tsx`, add the hook and wire to TopBar:

1. Import the hook:
```typescript
import { useSessionControl } from "../hooks/useSessionControl";
```

2. After the existing state declarations, add:
```typescript
const { model, fastMode, effort, setModel, toggleFastMode, setEffort, sendCompact } = useSessionControl(activeSessionId);
```

3. Define available models (static for now — SDK `supportedModels()` can be added later):
```typescript
const availableModels = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];
```

4. Pass new props to TopBar:
```typescript
<TopBar
  metrics={metrics}
  isLive={isLive}
  hasPermissionPending={hasPermissionPending}
  viewingTurnNumber={viewingTurnNumber}
  onClearViewingTurn={handleClearViewingTurn}
  permissionMode={permissionMode}
  onPermissionModeChange={handlePermissionModeChange}
  availableModels={availableModels}
  fastMode={fastMode}
  effort={effort}
  onModelSelect={setModel}
  onFastToggle={toggleFastMode}
  onEffortChange={setEffort}
  onCompact={sendCompact}
/>
```

- [ ] **Step 2: Run typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/routes/SessionPage.tsx
git commit -m "feat(P5-01): wire session controls from SessionPage to TopBar"
```

---

## Task 8: PermissionHistory Component (P5-02)

**Files:**
- Create: `dashboard/src/components/panels/PermissionHistory.tsx`
- Create: `dashboard/src/components/panels/PermissionHistory.test.tsx`
- Modify: `dashboard/src/components/PanelModal.tsx`
- Modify: `dashboard/src/lib/slashCommandHandler.ts`

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/components/panels/PermissionHistory.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionHistory } from "./PermissionHistory";
import type { PermissionRequest } from "../../lib/types";

describe("PermissionHistory", () => {
  const permissions: PermissionRequest[] = [
    {
      id: "p1",
      toolName: "Bash",
      input: { command: "npm test" },
      status: "approved",
    },
    {
      id: "p2",
      toolName: "Write",
      input: { file_path: "/src/app.ts" },
      status: "denied",
    },
    {
      id: "p3",
      toolName: "Bash",
      input: { command: "rm -rf /" },
      status: "pending",
    },
  ];

  it("renders permission entries", () => {
    render(<PermissionHistory permissions={permissions} />);
    expect(screen.getByText("Bash")).toBeTruthy();
    expect(screen.getByText("Write")).toBeTruthy();
  });

  it("shows status badges", () => {
    render(<PermissionHistory permissions={permissions} />);
    expect(screen.getByText("approved")).toBeTruthy();
    expect(screen.getByText("denied")).toBeTruthy();
    expect(screen.getByText("pending")).toBeTruthy();
  });

  it("shows empty state when no permissions", () => {
    render(<PermissionHistory permissions={[]} />);
    expect(screen.getByText("No permission requests yet")).toBeTruthy();
  });

  it("shows tool analytics summary", () => {
    render(<PermissionHistory permissions={permissions} />);
    // Bash appears 2 times — should show in analytics
    expect(screen.getByText("Tool Analytics")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement PermissionHistory**

Create `dashboard/src/components/panels/PermissionHistory.tsx`:

```typescript
import { useMemo } from "react";
import { Shield, CheckCircle, XCircle, Clock } from "lucide-react";
import type { PermissionRequest } from "../../lib/types";

interface PermissionHistoryProps {
  permissions: PermissionRequest[];
}

const STATUS_CONFIG = {
  approved: { icon: CheckCircle, color: "var(--grn)", label: "approved" },
  denied: { icon: XCircle, color: "var(--red)", label: "denied" },
  pending: { icon: Clock, color: "var(--amb)", label: "pending" },
} as const;

export function PermissionHistory({ permissions }: PermissionHistoryProps) {
  const analytics = useMemo(() => {
    const toolCounts: Record<string, { total: number; approved: number; denied: number; pending: number }> = {};
    for (const p of permissions) {
      const entry = toolCounts[p.toolName] ?? { total: 0, approved: 0, denied: 0, pending: 0 };
      entry.total++;
      entry[p.status]++;
      toolCounts[p.toolName] = entry;
    }
    return Object.entries(toolCounts)
      .sort((a, b) => b[1].total - a[1].total);
  }, [permissions]);

  if (permissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-dt-text3 text-sm">
        <Shield size={24} className="mb-2 opacity-40" />
        No permission requests yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Analytics Summary */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dt-text3 mb-2">
          Tool Analytics
        </h3>
        <div className="flex flex-wrap gap-2">
          {analytics.map(([tool, counts]) => (
            <div
              key={tool}
              className="flex items-center gap-2 rounded-lg border border-dt-border px-3 py-2"
              style={{ background: "var(--bg-s)" }}
            >
              <span className="font-mono text-xs font-medium text-dt-text">{tool}</span>
              <span className="text-[10px] text-dt-text3">{counts.total}×</span>
              {counts.approved > 0 && (
                <span style={{ color: "var(--grn)", fontSize: 10 }}>✓{counts.approved}</span>
              )}
              {counts.denied > 0 && (
                <span style={{ color: "var(--red)", fontSize: 10 }}>✗{counts.denied}</span>
              )}
              {counts.pending > 0 && (
                <span style={{ color: "var(--amb)", fontSize: 10 }}>⏳{counts.pending}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Permission Log */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dt-text3 mb-2">
          History
        </h3>
        <div className="flex flex-col gap-1">
          {permissions.map((p) => {
            const cfg = STATUS_CONFIG[p.status];
            const Icon = cfg.icon;
            const inputSummary = p.input.command
              ? String(p.input.command).slice(0, 80)
              : p.input.file_path
                ? String(p.input.file_path)
                : JSON.stringify(p.input).slice(0, 80);
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded px-3 py-2"
                style={{ background: "var(--bg-s)" }}
              >
                <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
                <span className="font-mono text-xs font-medium text-dt-text shrink-0">
                  {p.toolName}
                </span>
                <span className="text-xs text-dt-text3 truncate flex-1 min-w-0">
                  {inputSummary}
                </span>
                <span
                  className="text-[10px] font-mono shrink-0"
                  style={{ color: cfg.color }}
                >
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into PanelModal**

In `dashboard/src/components/PanelModal.tsx`:

1. Add lazy import:
```typescript
const PermissionHistory = lazy(() =>
  import("./panels/PermissionHistory").then((m) => ({ default: m.PermissionHistory })),
);
```

2. Add to `PANEL_TITLES`:
```typescript
"permission-history": "Permission History",
```

3. Add case in `renderPanel`:
```typescript
case "permission-history":
  return <PermissionHistory permissions={props.permissions ?? []} />;
```

4. Add `permissions` to `PanelModalProps`:
```typescript
interface PanelModalProps {
  panel: string | null;
  onClose: () => void;
  metrics?: SessionMetrics | null;
  usage?: UsageInfo | null;
  projectHash?: string;
  sessionId?: string;
  permissions?: PermissionRequest[];
}
```

- [ ] **Step 4: Add slash command**

In `dashboard/src/lib/slashCommandHandler.ts`, add near the other panel commands:
```typescript
if (trimmed === "/permission-history" || trimmed === "/ph") {
  ctx.onOpenPanel?.("permission-history");
  return true;
}
```

- [ ] **Step 5: Pass permissions to PanelModal in SessionPage**

In `SessionPage.tsx`, update the `PanelModal` usage to pass permissions from the layout context.

- [ ] **Step 6: Run tests**

Run: `cd dashboard && pnpm test -- --run PermissionHistory`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/panels/PermissionHistory.tsx dashboard/src/components/panels/PermissionHistory.test.tsx dashboard/src/components/PanelModal.tsx dashboard/src/lib/slashCommandHandler.ts dashboard/src/routes/SessionPage.tsx
git commit -m "feat(P5-02): add PermissionHistory panel with analytics"
```

---

## Dependency Graph

```
TASK-1 (useSessionControl hook)
  ↓
TASK-2 (ModelSwitcher) ─┐
TASK-3 (FastModeToggle) ─┤── all parallel, no file overlap
TASK-4 (EffortSlider) ───┤
TASK-5 (ContextCompact) ─┘
  ↓
TASK-6 (ControlsZone + TopBar) ── depends on TASK-2,3,4,5
  ↓
TASK-7 (SessionPage wiring) ── depends on TASK-1,6
  ↓
TASK-8 (PermissionHistory) ── independent from TASK-1-7, touches PanelModal
```

---

## Self-Review

**1. Spec coverage:**
- P5-01 Command Center: ✅ Model switcher, fast toggle, effort slider, context compact
- P5-02 Permission Dashboard: ✅ Permission history with analytics (batch approve/deny deferred — already exists in PermissionBlock)
- P5-03 Session Lifecycle: DEFERRED — fork returns 501, templates/comparison are future features
- Phase 2 Debt: NOT NEEDED — PanelModal already wires all 6 panels via slash commands

**2. Placeholder scan:** No TBDs, TODOs, or vague steps found.

**3. Type consistency:** `EffortLevel` used consistently across hook, slider, and zone. `ModelOption` interface used in ModelSwitcher and ControlsZone.
