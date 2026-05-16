import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { UsageTab } from "./UsageTab";
import type { UsageBreakdown, LiveContextUsage } from "../../lib/usage-types";
import { LayoutContext } from "../../contexts/LayoutContext";
import type { LayoutContextValue } from "../../contexts/LayoutContext";

type FetchSpec = { match: RegExp; body: unknown; ok?: boolean; status?: number };

function installFetchRouter(specs: FetchSpec[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const spec of specs) {
      if (spec.match.test(url)) {
        return {
          ok: spec.ok ?? true,
          status: spec.status ?? 200,
          json: async () => spec.body,
        } as Response;
      }
    }
    throw new Error(`Unrouted fetch in test: ${url}`);
  });
}

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response);
}

function makeLayoutCtx(overrides?: Partial<LayoutContextValue>): LayoutContextValue {
  return {
    repos: [], reposLoading: false, refreshRepos: () => {},
    permissions: [], decidePermission: async () => {}, decidePermissionSession: async () => {},
    usage: null, costs: null, isLive: false, registerSessionHandlers: () => {},
    currentMetrics: null, setCurrentMetrics: () => {},
    toolFilter: null, setToolFilter: () => {},
    questions: [], submitAnswer: async () => {},
    activeSessionId: null, setActiveSessionId: () => {},
    selected: null, setSelected: () => {},
    slugMap: new Map(), reverseSlugMap: new Map(),
    currentEvents: [], setCurrentEvents: () => {},
    currentLiveEvents: [], setCurrentLiveEvents: () => {},
    currentTurns: [], setCurrentTurns: () => {},
    currentDag: null, setCurrentDag: () => {},
    currentActiveTurnIndex: null, setCurrentActiveTurnIndex: () => {},
    currentSelectedAgent: null, setCurrentSelectedAgent: () => {},
    hasSubagents: false, setHasSubagents: () => {},
    currentSubagentMeta: null, setCurrentSubagentMeta: () => {},
    permissionMode: "default", setPermissionMode: () => {},
    turnHistoryOpen: true, setTurnHistoryOpen: () => {},
    viewingTurnNumber: undefined, setViewingTurnNumber: () => {},
    onClearViewingTurnRef: { current: null },
    onTurnClickRef: { current: null },
    openBottomTabRef: { current: null },
    highlightedToolUseId: null, setHighlightedToolUseId: () => {},
    highlightedHookId: null, setHighlightedHookId: () => {},
    lastResultStopReason: null, setLastResultStopReason: () => {},
    lastResultFinishReasons: null, setLastResultFinishReasons: () => {},
    autoCompactThreshold: null, setAutoCompactThreshold: () => {},
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UsageTab — historical / fallback mode (no sessionId)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the loading state before the fetch resolves", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}) as Promise<Response>);
    render(<UsageTab />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("renders one row per model with token columns", async () => {
    const breakdown: UsageBreakdown = {
      perModel: [
        {
          model: "claude-sonnet-4-6",
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 200,
          cacheReadTokens: 700,
          cacheHitRatio: 0.7,
          totalCost: 0.123,
        },
        {
          model: "claude-haiku-4-5",
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          cacheHitRatio: 0,
          totalCost: 0.004,
        },
      ],
      totalCost: 0.127,
    };
    mockFetchOnce({ breakdown });

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy();
    });
    expect(screen.getByText("claude-haiku-4-5")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("renders the cache-hit bar with width proportional to ratio", async () => {
    const breakdown: UsageBreakdown = {
      perModel: [
        {
          model: "claude-sonnet-4-6",
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 100,
          cacheReadTokens: 300,
          cacheHitRatio: 0.6,
          totalCost: 0.05,
        },
      ],
      totalCost: 0.05,
    };
    mockFetchOnce({ breakdown });

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy();
    });

    const bar = screen.getByTestId("cache-hit-bar-claude-sonnet-4-6");
    expect((bar as HTMLElement).style.width).toBe("60%");
  });

  it("shows an empty state when perModel is empty", async () => {
    mockFetchOnce({ breakdown: { perModel: [], totalCost: 0 } });

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText(/no usage data/i)).toBeTruthy();
    });
  });

  it("shows an error state when the fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load usage/i)).toBeTruthy();
    });
  });

  it("shows an error state on non-OK responses", async () => {
    mockFetchOnce({ error: "server exploded" }, false, 500);

    render(<UsageTab />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load usage/i)).toBeTruthy();
    });
  });
});

describe("UsageTab — live mode (sessionId + SDK context-usage)", () => {
  function makeRichUsage(): LiveContextUsage {
    return {
      categories: [{ name: "messages", tokens: 4000, color: "#000" }],
      totalTokens: 12345,
      maxTokens: 200000,
      percentage: 6.17,
      gridRows: [],
      model: "claude-sonnet-4-6",
      memoryFiles: [],
      mcpTools: [
        { name: "search", serverName: "exa", tokens: 800 },
        { name: "fetch_and_index", serverName: "context-mode", tokens: 1200 },
      ],
      agents: [
        { agentType: "general", source: "user", tokens: 400 },
        { agentType: "research", source: "built-in", tokens: 250 },
      ],
      skills: {
        totalSkills: 12,
        includedSkills: 5,
        tokens: 900,
        skillFrontmatter: [],
      },
      slashCommands: {
        totalCommands: 8,
        includedCommands: 4,
        tokens: 220,
      },
      autoCompactThreshold: 0.92,
      isAutoCompactEnabled: true,
      messageBreakdown: {
        toolCallTokens: 1500,
        toolResultTokens: 2200,
        attachmentTokens: 100,
        assistantMessageTokens: 3000,
        userMessageTokens: 1800,
        redirectedContextTokens: 0,
        unattributedTokens: 50,
        toolCallsByType: [],
        attachmentsByType: [],
      },
      apiUsage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 700,
      },
    };
  }

  it("renders the rich SDK breakdown (>=5 new sections) when context-usage is non-null", async () => {
    const ctx = makeLayoutCtx();
    installFetchRouter([
      { match: /\/api\/sessions\/[^/]+\/context-usage/, body: { usage: makeRichUsage() } },
    ]);

    render(
      <LayoutContext.Provider value={ctx}>
        <UsageTab sessionId="live-sess" />
      </LayoutContext.Provider>,
    );

    // Section labels (case-insensitive) — at least 5 new sections.
    await waitFor(() => {
      expect(screen.getByTestId("usage-section-mcp")).toBeTruthy();
    });
    expect(screen.getByTestId("usage-section-agents")).toBeTruthy();
    expect(screen.getByTestId("usage-section-skills")).toBeTruthy();
    expect(screen.getByTestId("usage-section-slash-commands")).toBeTruthy();
    expect(screen.getByTestId("usage-section-message-breakdown")).toBeTruthy();

    // Per-MCP-server rows
    expect(screen.getByText("exa / search")).toBeTruthy();
    // Per-agent rows
    expect(screen.getByText(/general/)).toBeTruthy();
    // Message breakdown labels — tool calls, tool results, etc.
    expect(screen.getByTestId("msg-bd-tool-calls")).toBeTruthy();
    expect(screen.getByTestId("msg-bd-tool-results")).toBeTruthy();
  });

  it("renders autoCompactThreshold as a labeled percentage", async () => {
    const ctx = makeLayoutCtx();
    installFetchRouter([
      { match: /\/api\/sessions\/[^/]+\/context-usage/, body: { usage: makeRichUsage() } },
    ]);

    render(
      <LayoutContext.Provider value={ctx}>
        <UsageTab sessionId="live-sess" />
      </LayoutContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auto-compact-threshold")).toBeTruthy();
    });
    const el = screen.getByTestId("auto-compact-threshold");
    expect(el.textContent).toMatch(/92%/);
  });

  it("publishes autoCompactThreshold into LayoutContext when usage is live", async () => {
    const setAutoCompactThreshold = vi.fn();
    const ctx = makeLayoutCtx({ setAutoCompactThreshold });
    installFetchRouter([
      { match: /\/api\/sessions\/[^/]+\/context-usage/, body: { usage: makeRichUsage() } },
    ]);

    render(
      <LayoutContext.Provider value={ctx}>
        <UsageTab sessionId="live-sess" />
      </LayoutContext.Provider>,
    );

    await waitFor(() => {
      expect(setAutoCompactThreshold).toHaveBeenCalledWith(0.92);
    });
  });

  it("falls back to /api/usage/breakdown when context-usage returns null", async () => {
    const ctx = makeLayoutCtx();
    const breakdown: UsageBreakdown = {
      perModel: [
        {
          model: "claude-sonnet-4-6",
          inputTokens: 100, outputTokens: 50,
          cacheCreationTokens: 10, cacheReadTokens: 30,
          cacheHitRatio: 0.5, totalCost: 0.01,
        },
      ],
      totalCost: 0.01,
    };
    installFetchRouter([
      { match: /\/api\/sessions\/[^/]+\/context-usage/, body: { usage: null } },
      { match: /\/api\/usage\/breakdown/, body: { breakdown } },
    ]);

    render(
      <LayoutContext.Provider value={ctx}>
        <UsageTab sessionId="cold-sess" />
      </LayoutContext.Provider>,
    );

    // Fallback rendered (per-model row from breakdown endpoint).
    await waitFor(() => {
      expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy();
    });
    // Rich breakdown sections must NOT be present in fallback mode.
    expect(screen.queryByTestId("usage-section-mcp")).toBeNull();
  });
});
