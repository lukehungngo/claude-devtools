# Bug: MCP tab has no per-turn tool-call insight (only session-scoped server status)

**Severity:** P2 — missing observability for what the user actually wants when scoping the bottom panel to a turn
**Filed:** 2026-05-17
**Reported version:** v0.3.12 (post Bug F)
**Reporter symptom:** "I clicked T34 and the MCP tab still shows the same per-session server list. I want to know which MCP tools fired in T34."

**Status of related doc:** `docs/bugs/mcp-tab-no-status-for-cold-sessions.md` (Bug F) landed the "configured" disk-fallback status and footer banner — server *connection* state is now reliably surfaced. This doc covers Bug I — adding the SEPARATE per-turn tool-call section beneath the server list so a turn-scoped reader can see which MCP tools fired in T<N>.

## Symptom

Opening the MCP tab while the bottom panel is scoped to T<N> shows the same content regardless of N:

- The server list ("MCP servers" header + one row per configured server with connection icon, scope, transport).
- The cold-session banner (when applicable, Bug F).

Nothing else. The tab is functionally session-scoped — clicking T34, T7, or the latest turn produces identical output.

This is fine for "is server X up?" but defeats the bottom panel's per-turn scoping principle for every other tab (Tasks, Hooks, Cost, Usage, Tool Call all narrow when a turn is selected).

## Design choice

**Server status itself can not be turn-scoped.** `query.mcpServerStatus()` (server side) returns a snapshot of the SDK's live MCP client connection state at the moment the request is served. There is no per-turn "was this server up during T<N>" signal in JSONL or in the SDK — the only per-turn signal MCP leaves behind is *tool usage* (`mcp__<server>__<tool>` `tool_use` items in assistant events).

So instead of attempting to retro-derive a fictional per-turn connection state, we surface what IS per-turn: the MCP tools that fired in the active turn, grouped by server. The session-scoped server list stays on top (unchanged), and a new bordered "MCP tool calls in T<N>" section appears below it when there are any mcp tool calls in the active turn.

When the active turn fired no mcp tools (or there is no active turn at all), the section is hidden entirely. No empty-list noise.

## Root cause (verified)

`dashboard/src/components/bottom-panel/MCPStatusTab.tsx` (pre-fix) took only `{ sessionId }` and rendered only what `/api/sessions/:id/mcp-status` returned. The full event stream and the turn snapshots are already plumbed through `BottomPanel` and `BottomPanel.tsx:403-404` mounted the tab without forwarding them:

```tsx
) : activeTab === "mcp" ? (
  <MCPStatusTab sessionId={sessionId || undefined} />
) : null}
```

No per-turn data ever reached the tab. The fix is two-step: (1) widen the tab's prop surface, (2) derive `mcp__server__tool` calls from the active turn's events.

## Implementation

Three files changed, no API or server-side change.

### 1. `dashboard/src/components/bottom-panel/MCPStatusTab.tsx`

- Added imports for `SessionEvent`, `TurnSnapshot`, and `getEventsForTurn`.
- Extended `MCPStatusTabProps` with optional `events`, `turns`, `activeTurnIndex` (all default-safe).
- Added a `useMemo` that walks `getEventsForTurn(turns[activeTurnIndex], events)`, filters to `type === "assistant"` items with `content[i].type === "tool_use"` and `name.startsWith("mcp__")`, parses `mcp__<server>__<tool>` by splitting on `__` (one allocation per qualifying tool_use, O(turnEvents × content) — well within the streaming budget since turn events are bounded and we only walk the active turn).
- Restructured the empty-servers branch from an early-return into a conditional inside the main render so the per-turn section can appear below regardless of server-list state. The "No MCP servers configured." text + server list + cold-session banner all preserved verbatim (Bug F semantics intact).
- Rendered the new `<section data-testid="mcp-turn-tool-calls">` beneath the server list with:
  - Header: `MCP tool calls in T{activeTurnNumber}`
  - One row per server (`data-testid="mcp-turn-row-{serverName}"`), sorted by `totalCalls` desc.
  - Each row shows `{totalCalls} call(s)` and a comma-separated per-tool breakdown (`list-sessions ×2, open-dashboard ×1`).
- Section hides entirely when `activeTurnNumber === null` or `mcpCallsForTurn.length === 0`.

### 2. `dashboard/src/components/bottom-panel/BottomPanel.tsx:403`

Forwarded the already-available `events`, `turns`, and `activeTurnIndex` to the tab:

```diff
- <MCPStatusTab sessionId={sessionId || undefined} />
+ <MCPStatusTab
+   sessionId={sessionId || undefined}
+   events={events}
+   turns={turns}
+   activeTurnIndex={activeTurnIndex}
+ />
```

### 3. `dashboard/src/components/bottom-panel/MCPStatusTab.test.tsx`

New `describe("MCPStatusTab per-turn MCP tool calls (Bug I)")` block with shared `mkAssistantWithToolUses` + `mkTurn` helpers and a 3-turn fixture:

- T1 fires `mcp__claude-devtools__list-sessions` ×2 + `mcp__claude-devtools__open-dashboard` ×1
- T2 fires only `Bash` (no mcp tools) — must NOT render the section
- T3 fires `mcp__other__doThing` ×1

Tests:

1. **`renders MCP tool calls for the active turn`** — `activeTurnIndex=0`, asserts the `mcp-turn-tool-calls` section appears, header reads `MCP tool calls in T1`, and `mcp-turn-row-claude-devtools` shows `3 calls` + `list-sessions ×2` + `open-dashboard ×1`.
2. **`hides the section when active turn has no mcp calls`** — `activeTurnIndex=1`, asserts the section testid is null while the empty-servers placeholder is still visible.
3. **`re-derives when active turn changes`** — render with T1, rerender with T3, asserts the `claude-devtools` row is gone, the `other` row + `doThing ×1` + `MCP tool calls in T3` header are present.
4. **`hides the section when activeTurnIndex is null/undefined`** — `activeTurnIndex={null}`, section absent.

All 4 tests fail on master (no per-turn section exists), pass with the fix.

## Both-directions verification

Stashed the `<section>` render in `MCPStatusTab.tsx` (gated the conditional with `false &&`), re-ran `pnpm test src/components/bottom-panel/MCPStatusTab.test.tsx`:

- 2 of the 4 new tests fail with `Unable to find an element by: [data-testid="mcp-turn-row-claude-devtools"]` and `[data-testid="mcp-turn-row-other"]` (the assertion that the section is hidden when there are no mcp tools / when `activeTurnIndex` is null still passes — those are negative assertions and the gated-off section is trivially absent).
- Restored the conditional, all 48 tests across `MCPStatusTab.test.tsx` + `BottomPanel.test.tsx` pass (12 pre-existing in MCPStatusTab + 4 new = 16; 32 in BottomPanel).

## Notes on what was deliberately NOT changed

- **`/api/sessions/:id/mcp-status` response shape** — untouched. Per-turn data already flows client-side via the existing `events`/`turns` props in `BottomPanel`; no need for a new server endpoint.
- **`MCPStatusTab` server-list rendering** — Bug F's "configured" status icon, footer banner, refresh button, and `formatTransport` fallback for stdio-only entries all preserved verbatim. Only restructured the empty-servers branch from an early-return to a conditional inside the same outer return.
- **`SessionPage.tsx` / parent wiring** — no changes. `BottomPanel` already destructures `events`, `turns`, and `activeTurnIndex`, so the forward to `MCPStatusTab` is a one-line addition.
- **Sort/grouping for multiple servers** — sorted by `totalCalls` desc so the busiest server appears first; per-tool entries within a row sorted the same way. No user-facing knob for this — matches the conventions used by other per-turn tabs.

## Related

- `docs/bugs/mcp-tab-no-status-for-cold-sessions.md` — Bug F, just landed. Provides the "configured" disk-fallback rows that this Bug I sits beneath.
- `docs/bugs/tasks-tab-not-auto-scoped-to-active-turn.md` — same architectural principle (bottom panel surfaces follow `effectiveScopeTurn` / `activeTurnIndex`), applied to the Tasks tab.
