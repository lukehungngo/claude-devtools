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
- **proposal:** [link to approved research proposal, if applicable]
- **design_spec:** [link to approved design spec, if applicable — only for UI tasks]

## Objective

{One paragraph max. What should be built/fixed/researched and why.}

## Acceptance Criteria

Each criterion MUST be a runnable shell command:

- [ ] `echo "No test runner configured"` passes
- [ ] `echo "No linter configured"` clean
- [ ] `cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit` clean
- [ ] `{specific functional check}` — e.g., `curl localhost:8080/api/health | jq .status`

## Business Context

{Link to original requirement, OKR, issue, or user story. Why does this matter?}

## Output

Write result to `tasks/done/TASK-{id}-result.md`
