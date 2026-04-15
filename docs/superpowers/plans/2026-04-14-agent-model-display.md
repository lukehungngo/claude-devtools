# Implementation Plan: Agent Model Display in DAG Graph

## Goal
Surface the model used by each agent (main and subagents) in the agent graph tooltip, by threading `event.message.model` through `analyzeEvents()` → `AgentNode` → `AgentNodeCard`.

## Architecture
The `model` field already exists on every `assistant` JSONL event at `event.message.model`. The `dag-builder.ts` already reads it for cost calculation — it just discards it. We add `model?: string` to `AgentNode`, capture it in `analyzeEvents()`, pass it through `buildAgentDAG()`, and render it in the hover tooltip. Two type files are mirrors of each other and updated together.

## File Map

| File | Change |
|------|--------|
| `server/src/types.ts` | Add `model?: string` to `AgentNode` |
| `dashboard/src/lib/types.ts` | Same (mirror type) |
| `server/src/analyzer/dag-builder.ts` | Return `model` from `analyzeEvents()`, pass to `AgentNode` |
| `server/src/analyzer/dag-builder.test.ts` | Add 2 tests verifying model is populated |
| `dashboard/src/components/AgentNodeCard.tsx` | Render `node.model` in tooltip, update memo comparator |

---

## Tasks

### TASK-001: Wire `model` through types, dag-builder, and tests

- **Agent:** engineer
- **Files:**
  - Modify: `server/src/types.ts` (line 156–167, `AgentNode`)
  - Modify: `dashboard/src/lib/types.ts` (line 168–179, `AgentNode`)
  - Modify: `server/src/analyzer/dag-builder.ts`
  - Modify: `server/src/analyzer/dag-builder.test.ts`
- **Approach:**
  1. Add `model?: string` to `AgentNode` in both type files
  2. In `analyzeEvents()` return type and body: track `lastModel` (last `event.message.model` seen), return it alongside the other fields
  3. In `buildAgentDAG()`: pass `mainAnalysis.model` and `analysis.model` when constructing each `AgentNode`
- **Tests (TDD — write failing tests first):**

  Add to `server/src/analyzer/dag-builder.test.ts`:

  ```ts
  it("sets model on main node from last assistant event model", () => {
    const dag = buildAgentDAG(
      [makeAssistantEvent({ model: "claude-opus-4-6" })],
      new Map(),
      new Map()
    );
    expect(dag.nodes[0].model).toBe("claude-opus-4-6");
  });

  it("sets model on subagent node from its events", () => {
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent({ model: "claude-sonnet-4-6" })]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore" }],
    ]);
    const dag = buildAgentDAG(
      [makeAssistantEvent({ model: "claude-opus-4-6" })],
      subagentEvents,
      subagentMeta
    );
    const subagentNode = dag.nodes.find((n) => n.id === "agent-1")!;
    expect(subagentNode.model).toBe("claude-sonnet-4-6");
  });
  ```

  Implementation changes to `dag-builder.ts`:

  ```ts
  // analyzeEvents() return type — add model:
  function analyzeEvents(events: SessionEvent[]): {
    tokens: AggregatedTokens;
    toolCalls: number;
    mcpToolCalls: number;
    status: "active" | "completed" | "error";
    agentDescriptions: string[];
    model?: string;  // ← ADD
  }

  // Inside analyzeEvents() body — track lastModel:
  let lastModel: string | undefined;

  // In the assistant event branch, after reading model for cost:
  const model = event.message.model || "claude-sonnet-4-6";
  lastModel = model;  // ← ADD (track last seen model)
  totalCost += calculateTokenCost(model, { ... });

  // In the return statement:
  return {
    tokens: { ... },
    toolCalls,
    mcpToolCalls,
    status,
    agentDescriptions,
    model: lastModel,  // ← ADD
  };

  // In buildAgentDAG(), main node:
  nodes.push({
    id: "main",
    type: "main",
    description: "Main session",
    tokenUsage: mainAnalysis.tokens,
    toolCalls: mainAnalysis.toolCalls,
    mcpToolCalls: mainAnalysis.mcpToolCalls,
    status: mainAnalysis.status,
    startTime: mainEvents[0]?.timestamp,
    endTime: mainEvents[mainEvents.length - 1]?.timestamp,
    model: mainAnalysis.model,  // ← ADD
  });

  // In buildAgentDAG(), subagent node:
  nodes.push({
    id: agentId,
    type: meta?.agentType || agentId,
    description: meta?.description || agentId,
    parentId: "main",
    tokenUsage: analysis.tokens,
    toolCalls: analysis.toolCalls,
    mcpToolCalls: analysis.mcpToolCalls,
    status: analysis.status,
    startTime: events[0]?.timestamp,
    endTime: events[events.length - 1]?.timestamp,
    model: analysis.model,  // ← ADD
  });
  ```

- **Verify:**
  ```bash
  cd /Users/soh/working/ai/claude-devtools/server && npx vitest run src/analyzer/dag-builder.test.ts 2>&1 | tail -10
  cd /Users/soh/working/ai/claude-devtools/server && npx tsc --noEmit 2>&1 | head -20
  cd /Users/soh/working/ai/claude-devtools/dashboard && npx tsc --noEmit 2>&1 | head -20
  ```
- **Depends on:** none
- **Est:** 5 min

---

### TASK-002: Render model in AgentNodeCard tooltip

- **Agent:** engineer
- **Files:**
  - Modify: `dashboard/src/components/AgentNodeCard.tsx`
- **Approach:**
  Add `node.model` to the hover tooltip (after the Status line), and add `model` to the memo comparator so the card re-renders if the model changes (possible during an active session if the user changes models mid-run).
- **Tests (TDD — write failing test first):**

  Check if `AgentNodeCard.test.tsx` exists. If not, create `dashboard/src/components/AgentNodeCard.test.tsx`:

  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, fireEvent } from "@testing-library/react";
  import { AgentNodeCard } from "./AgentNodeCard";
  import type { AgentNode } from "../lib/types";

  // ReactFlow NodeProps mock
  function makeProps(node: AgentNode, extra: Record<string, unknown> = {}) {
    return {
      id: node.id,
      type: "agentNode",
      xPos: 0,
      yPos: 0,
      data: { agent: node, ...extra },
      selected: false,
      isConnectable: true,
      zIndex: 0,
      dragging: false,
      targetPosition: undefined,
      sourcePosition: undefined,
    };
  }

  function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
    return {
      id: "main",
      type: "main",
      status: "completed",
      toolCalls: 0,
      mcpToolCalls: 0,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0.001,
      },
      ...overrides,
    };
  }

  describe("AgentNodeCard", () => {
    it("shows model in tooltip when node.model is set", () => {
      const node = makeNode({ model: "claude-opus-4-6" });
      const { container } = render(<AgentNodeCard {...makeProps(node)} />);

      // Trigger hover
      const card = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(card);

      expect(container.textContent).toContain("claude-opus-4-6");
    });

    it("does not show model line in tooltip when node.model is absent", () => {
      const node = makeNode(); // no model
      const { container } = render(<AgentNodeCard {...makeProps(node)} />);

      const card = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(card);

      expect(container.textContent).not.toContain("Model:");
    });
  });
  ```

  Implementation change to `AgentNodeCard.tsx`:

  ```tsx
  {/* In the tooltip, after the Status line (line 66): */}
  <div>Status: {node.status}</div>
  {node.model && (
    <div>Model: {node.model}</div>
  )}
  ```

  Memo comparator update (line 136–145):
  ```tsx
  return (
    prevNode.status === nextNode.status &&
    prevNode.type === nextNode.type &&
    prevNode.tokenUsage.totalCost === nextNode.tokenUsage.totalCost &&
    prevNode.toolCalls === nextNode.toolCalls &&
    prev.data.selected === next.data.selected &&
    prevNode.model === nextNode.model   // ← ADD
  );
  ```

- **Verify:**
  ```bash
  cd /Users/soh/working/ai/claude-devtools/dashboard && npx vitest run src/components/AgentNodeCard.test.tsx 2>&1 | tail -10
  cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm test 2>&1 | tail -5
  ```
- **Depends on:** TASK-001
- **Est:** 4 min

---

## Dependency Graph

```
TASK-001 (types + dag-builder + server tests)
    ↓
TASK-002 (AgentNodeCard render + UI test)
```

## Risk Assessment

- **Low:** The `model` field on `AgentNode` is optional (`model?: string`) so existing serialized DAGs without the field (e.g. cached sessions) won't break — tooltip just won't show the model line.
- **Low:** The memo comparator addition only adds a cheap string comparison — no perf risk.
- **Low:** `makeAssistantEvent()` in `dag-builder.test.ts` already has a `model` override param (line 11) so test helpers need no changes.
- **Watch:** If the `AgentNodeCard` test needs full ReactFlow context providers to render, the test will need a wrapper. Check if other component tests in the codebase mock ReactFlow's `Handle` and `Position` imports.
