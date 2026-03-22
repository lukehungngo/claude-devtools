---
description: Scaffold a new feature with the MAS workflow
---

# New Feature

Scaffold a new feature: $ARGUMENTS

## Steps

1. **Create feature branch:**
   ```bash
   git checkout -b feature/{{name}}
   ```

2. **Create task spec** using `.claude/templates/task-spec.md`:
   - Fill in Meta, Context, Objective, Acceptance Criteria
   - Save to `tasks/pending/TASK-{next-id}.md`

3. **If research needed** (novel approach):
   - Dispatch Researcher agent
   - Run Research Convergence Protocol (max 3 rounds with Differential Reviewer)
   - Get approved proposal before implementation

4. **If known pattern** (existing code to follow):
   - Identify the pattern in the codebase
   - Reference it in the task spec

5. **Present task spec to human** for approval before implementation.

6. **After approval**, run `/dev-loop` with the approved task spec.

## Template

```markdown
## New Feature: {{name}}

### Problem
{{What problem does this solve?}}

### Approach
{{How will we solve it?}}

### Files
- Create: {{new files}}
- Modify: {{existing files}}

### Acceptance Criteria
- [ ] `echo "No test runner configured"` passes
- [ ] `echo "No linter configured"` clean
- [ ] {{functional criterion}}
```
