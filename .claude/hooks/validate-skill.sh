#!/bin/bash
# PreToolUse hook: Validate Skill tool invocation naming

INPUT=$(cat)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"

if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

SKILL=$(echo "$INPUT" | grep -o '"skill"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"skill"[[:space:]]*:[[:space:]]*"//' | sed 's/"//')

if [ -z "$SKILL" ]; then
  exit 0
fi

ALLOWLIST="${CLAUDE_PROJECT_DIR}/.claude/hooks/allowed-bare-skills.txt"
if [ -f "$ALLOWLIST" ] && grep -qxF "$SKILL" "$ALLOWLIST" 2>/dev/null; then
  exit 0
fi

SUPERPOWERS_SKILLS="writing-plans brainstorm brainstorming executing-plans verification verification-before-completion finishing-branch finishing-a-development-branch subagent-driven-development test-driven-development systematic-debugging using-git-worktrees dispatching-parallel-agents requesting-code-review receiving-code-review"

for s in $SUPERPOWERS_SKILLS; do
  if [ "$SKILL" = "$s" ]; then
    echo "BLOCKED: Bare superpowers skill name '$s' detected."
    echo "Use 'superpowers:${s}' instead."
    exit 2
  fi
done

MAS_SKILLS="dev-loop bug-fix reflect release bootstrap ask-questions verification reliability-review se-principles differential-review obsidian"

for s in $MAS_SKILLS; do
  if [ "$SKILL" = "$s" ]; then
    echo "BLOCKED: Bare MAS skill name '$s' detected."
    echo "Use 'mas:${s}' instead."
    exit 2
  fi
done

exit 0
