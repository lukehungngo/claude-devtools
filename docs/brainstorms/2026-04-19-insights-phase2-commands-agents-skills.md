# Brainstorm: Insights Phase 2 — Commands, Agents, Skills, Efficiency Hints

**Date:** 2026-04-19
**Input type:** Context (what's done, what remains)
**Input:** Bug 1 + Phase 1 merged. 4 placeholder sections remain in InsightsPage: Commands, Agents, Skills, Efficiency Hints. Figure out what to do next.

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Bug 1 + Phase 1 (model-mix, top-consumers) are done | CONFIRMED | Merged to master, 611 tests pass |
| 4 placeholders remain: Commands, Agents, Skills, Efficiency Hints | CONFIRMED | `PLACEHOLDER_SECTIONS = ["Commands", "Agents", "Skills", "Efficiency Hints"]` in InsightsPage.tsx:25 |
| JSONL has the data for Commands/Agents/Skills | CONFIRMED | user events with `/` prefix, tool_use name="Task"/"Skill" |
| Efficiency Hints is the same kind of work as the others | QUESTIONED | It's inference, not aggregation — see Fundamentals |

## Fundamentals

### Commands, Agents, Skills — pure aggregation

All three parse `tool_use` or human message content from JSONL events already in memory via `discoverSessions()`.

**Commands:** Human `user` events where content array contains a text block starting with `/` → extract first word (e.g., `/compact`, `/model`), count by name, compute share.

**Agents:** Assistant events containing `tool_use` blocks where `name === "Task"` → extract `input.subagent_type ?? input.description ?? "unknown"`, count by type.

**Skills:** Assistant events containing `tool_use` blocks where `name === "Skill"` → extract `input.skill`, count by name.

All three: one pass over session events, same statSync + byte-offset incremental cache pattern as model-mix and top-consumers.

### Efficiency Hints — categorically different

Not aggregation — inference. Pattern detection → actionable recommendation.
- Requires threshold rules or heuristics
- Risk of wrong/misleading hints from sparse data
- Implementation complexity ~5× the data sections
- Value: uncertain until real data patterns emerge

## Output

### Decision: Build Commands + Agents + Skills now. Defer Efficiency Hints.

Efficiency Hints belongs in a separate, later phase after we can see what patterns actually appear in real usage data.

### Backend plan

Single new route: `GET /insights/commands-agents-skills`

Return type:
```ts
interface InsightsCommandsAgentsSkills {
  commands: { name: string; count: number; share: number }[];
  agents: { type: string; count: number; share: number }[];
  skills: { name: string; count: number; share: number }[];
}
```

One parsing pass per session. Cache with same statSync + byte-offset pattern. Top-10 for each. Share = fraction of #1 entry's count (same as top-consumers convention).

### Parsing logic

```
For each session event:
  if event.type === "user":
    for each content block of type "text":
      if text starts with "/":
        commandName = text.split(/\s/)[0]  // e.g. "/compact"
        commands[commandName]++

  if event.type === "assistant":
    for each content block of type "tool_use":
      if block.name === "Task":
        agentType = block.input?.subagent_type ?? block.input?.description ?? "unknown"
        agents[agentType]++
      if block.name === "Skill":
        skillName = block.input?.skill ?? "unknown"
        skills[skillName]++
```

### Frontend plan

Replace 3 placeholder cards (Commands, Agents, Skills) with ranked-list cards using the same rank-badge + name + progress-bar + count pattern established in top-consumers.

Replace "Efficiency Hints" placeholder with a static "Coming soon" card, or remove it from PLACEHOLDER_SECTIONS entirely.

### Files

- Create: `server/src/analyzer/insights-commands-agents-skills.ts`
- Create: `server/src/analyzer/insights-commands-agents-skills.test.ts`
- Modify: `server/src/http/routes/insights-routes.ts` — add GET /insights/commands-agents-skills
- Modify: `server/src/http/routes/insights-routes.test.ts` — add tests for new route
- Modify: `server/src/types.ts` — add InsightsCommandsAgentsSkills type
- Create: `dashboard/src/hooks/useInsightsCommandsAgentsSkills.ts`
- Modify: `dashboard/src/routes/InsightsPage.tsx` — replace 3 placeholders + remove/replace Efficiency Hints

## Next Steps

`/mas:dev-loop implement insights phase 2: commands, agents, skills sections — see docs/brainstorms/2026-04-19-insights-phase2-commands-agents-skills.md`
