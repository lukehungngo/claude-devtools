# Agent Workflow Rules

Structural constraints beat prose instructions. If the model ignores "MUST", remove the tool or add a gate instead.

## Rules

1. **Show exact tool calls** — `Skill(skill: "verification")`, not "use the verification skill"
2. **Remove tools to enforce constraints** — Orchestrator has no Bash (can't implement inline)
3. **Engineers use Write/Edit, not Bash heredocs** for file changes
4. **Route unknown patterns to Researcher** — default to thorough path, not fast path
5. **Ban PlanMode** — use `Skill(skill: "writing-plans")` for structured TASK-{id} plans
6. **Track cycle limits with counters** — `review_cycle >= 2` → STOP and escalate
7. **Verify with the skill, not ad-hoc** — `Skill(skill: "verification")` runs the full checklist
8. **File-existence gates enforce pipeline** — `docs/results/TASK-*-result.md` must exist before review
