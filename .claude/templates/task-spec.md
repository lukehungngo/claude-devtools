# TASK-{id}: {title}

## Meta
- **id:** TASK-{id}
- **type:** research | design | impl | review | bugfix
- **agent:** orchestrator | engineer | reviewer | researcher | differential-reviewer | bug-fixer | ui-ux-designer
- **status:** pending | in-progress | done | blocked
- **depends_on:** [TASK-xxx, ...]
- **parallel_safe:** true | false
- **priority:** P0 | P1 | P2

## Context
- **relevant_files:** [list of exact file paths that CAN be touched]
- **do_not_touch:** [list of file paths that MUST NOT be modified]
- **reference_files:** [list of files to read for context, but not modify]
- **proposal:** [path to approved research proposal in `docs/plans/`, if applicable]
- **design_spec:** [path to approved design spec in `docs/design/`, if applicable — only for UI tasks]

## Objective

{One paragraph max. What should be built/fixed/researched and why.}

## Acceptance Criteria

Each criterion MUST be a runnable shell command:

- [ ] `cd server && pnpm test && cd ../dashboard && pnpm test` passes
- [ ] `pnpm lint` clean
- [ ] `cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit` clean
- [ ] `{specific functional check}` — e.g., `curl localhost:8080/api/health | jq .status`

## Business Context

{Link to original requirement, OKR, issue, or user story. Why does this matter?}

## Output

Write result based on task type:
- **research** → `docs/plans/TASK-{id}-research-r{round}.md`
- **design** → `docs/design/TASK-{id}-design.md` + `docs/design/TASK-{id}-mockup.html`
- **impl** → `docs/results/TASK-{id}-result.md`
- **review** → `docs/reports/TASK-{id}-review.md`
- **bugfix** → `docs/reports/TASK-{id}-bugfix-result.md`
