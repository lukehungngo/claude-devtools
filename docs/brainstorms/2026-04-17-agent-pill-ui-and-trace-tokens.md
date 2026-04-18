# Brainstorm: Agent Pill UI Enhancement & Trace Token Column

**Date:** 2026-04-17
**Input type:** Hunch (Image #1) + Idea (Image #2)
**Input:** Image #1 — "bad ui, need enhancement" showing pill `• mas:engineer:engineer x25 $0.572 31/3K`. Image #2 — "here i need to add another column for in/out token" showing the TraceTab table with AGENT/NAME/MODEL/DURATION/COST columns.

---

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| The pill showing `mas:engineer:engineer` is `AgentPills.tsx` | CONFIRMED | Code grep: AgentPills renders `{agent.agentType === "main" ? "Main" : agent.agentType}` with no name cleanup |
| `31/3K` is `formatTokens(tokensIn)/formatTokens(tokensOut)` | CONFIRMED | AgentPills.tsx line 104: `{formatTokens(agent.tokensIn)}/{formatTokens(agent.tokensOut)}` |
| `formatTokens(31)` returns `"31"` (raw), `formatTokens(3000)` returns `"3K"` | CONFIRMED | cost.ts: only abbreviates ≥1000 |
| The table in Image #2 is `TraceTab.tsx` | CONFIRMED | TraceTab.tsx has AGENT/NAME/MODEL/DURATION/COST columns, drag-resize handles |
| `AgentNode.tokenUsage.inputTokens` and `.outputTokens` exist | CONFIRMED | types.ts: `AggregatedTokens` has both fields |
| Token data flows into TraceRow via `node.tokenUsage` | CONFIRMED | `aggregateCost()` uses `node.tokenUsage.totalCost`; tokens are on the same object |

---

## Fundamentals

### Image #1 — Why does the pill look bad?

**Component:** `AgentPills.tsx` — renders per-agent summary pills inside each turn.

**Three distinct problems:**

**Problem 1: Name too long — `mas:engineer:engineer`**
- Fundamental truth: `agent.agentType` is set directly from the subagent `subagent_type` parameter, e.g. `mas:engineer:engineer`. No normalization strips the namespace prefix.
- The existing `AGENT_COLORS` map only handles simple names (`main`, `Explore`, `researcher`, etc.) — MAS-prefixed types get no match and fall through to the default grey.
- Result: 22-character name that conveys no more information than `engineer`.
- Fix: strip the namespace — `mas:engineer:engineer` → `engineer`, `mas:reviewer:reviewer` → `reviewer`. The pattern is: take the last colon-delimited segment, deduplicate if it repeats (e.g. `engineer:engineer` → `engineer`).

**Problem 2: `31/3K` is ambiguous**
- Fundamental truth: `formatTokens()` only abbreviates ≥1000. So `31` input tokens is shown raw while `3000` output tokens becomes `3K`.
- The slash separator `31/3K` has no label. Is it `in/out` or `context/generated`? A reader can't tell.
- Additionally, `31` looks like an accident — why not just remove token display when input is very small?
- Fix: add directional indicators — `↑31 ↓3K` (up=in, down=out) makes the direction obvious. Or: add a `title` tooltip `"31 tokens in / 3K tokens out"`. Or: only show tokens when both are non-trivial (e.g. both > 100).

**Problem 3: Visual density**
- Five pieces of data on one pill: dot + name + invocationCount + cost + tokens.
- All in the same text size and weight. Hard to scan.
- Fix: the `opacity-70` and `opacity-60` classes on count/cost/tokens already help, but the name is the anchor — it must stand out. Truncating + cleaning the name is the highest-leverage fix.

### Image #2 — Add token column to TraceTab

**Component:** `TraceTab.tsx` — Gantt-chart table with drag-resizable columns.

**What exists:**
- `TraceRow.totalCost` is computed in `buildRow()` from `aggregateCost(node.id)` or `node.tokenUsage.totalCost`
- The same `node.tokenUsage` object has `.inputTokens` and `.outputTokens`
- For root nodes, `aggregateCost()` already sums descendants — the same pattern must apply to tokens (sum all descendants' tokens for root, own tokens for leaf)
- Column pattern is fully established: `const [tokensWidth, setTokensWidth] = useState(TOKENS_COL_WIDTH)` + resize handler + header div + data div + `DATA_COLS_WIDTH` update

**What's needed:**
1. Add `tokensIn: number` and `tokensOut: number` to `TraceRow` interface
2. Add `aggregateTokens(nodeId, 'in'|'out')` function (or merge into existing `aggregateCost` pattern) — OR add a single `aggregateTokenUsage(nodeId)` returning `{tokensIn, tokensOut, totalCost}`
3. Add `TOKENS_COL_WIDTH = 80` constant
4. Add `tokensWidth` state + resize handler
5. Add column header `IN/OUT` and cell `{formatTokens(row.tokensIn)}/{formatTokens(row.tokensOut)}`
6. Update `DATA_COLS_WIDTH` to include tokensWidth
7. Update `TraceRowComponent` props + render
8. Add resize handle after cost column

**Performance:** O(1) per cell — no new iteration, token data is already on `tokenUsage`.

---

## Output

### Image #1 — Solution Direction

**Fix 1 (HIGH VALUE): Normalize agent type names in AgentPills**

Add a `normalizeAgentType(type: string): string` utility:
```typescript
// "mas:engineer:engineer" → "engineer"
// "mas:reviewer:reviewer" → "reviewer"  
// "mas:ui-ux-designer:ui-ux-designer" → "ui-ux-designer"
// "engineer" → "engineer" (already clean)
// "main" → "main"
function normalizeAgentType(type: string): string {
  const parts = type.split(":");
  const last = parts[parts.length - 1];
  return last || type;
}
```

This single change removes `mas:` prefix and handles the `engineer:engineer` repetition in one go. Apply in `AgentPills.tsx` where `agent.agentType` is used for display (and for color lookup). Add `title={agent.agentType}` to the pill for the full name on hover.

**Fix 2 (MEDIUM VALUE): Clarify token display**

Option A — directional arrows (recommended):
```tsx
<span className="pill-tokens opacity-60 text-sm font-mono">
  ↑{formatTokens(agent.tokensIn)} ↓{formatTokens(agent.tokensOut)}
</span>
```
Shows `↑31 ↓3K` — immediately clear which is which.

Option B — add tooltip only, keep slash format but add `title="31 tokens in / 3K tokens out"`.

Option A is better: no hover required to understand.

**Fix 3 (LOW VALUE): Token threshold**

Only show tokens when at least one is ≥ 100:
```tsx
{(agent.tokensIn >= 100 || agent.tokensOut >= 100) && (
  <span ...>{...}</span>
)}
```
Prevents cluttering the pill for trivial subagents.

### Image #2 — Solution Direction

Add a `TOKENS` column to `TraceTab` after `COST`. Data exists on `node.tokenUsage` — it's a straightforward column extension following the exact same pattern as the existing columns.

For root nodes: sum tokens across all descendants (same recursion as `aggregateCost`).  
Display: `{formatTokens(tokensIn)}/{formatTokens(tokensOut)}` — consistent with AgentPills.  
Column header: `IN/OUT` (matches the user's request).  
Width: `80px` default, drag-resizable like others.

---

## Next Steps

```
/mas:dev-loop implement both fixes — see docs/brainstorms/2026-04-17-agent-pill-ui-and-trace-tokens.md
```
