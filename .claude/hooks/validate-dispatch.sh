#!/bin/bash
# PreToolUse hook: validate Agent dispatch naming
# Blocks bare agent names (e.g., "engineer" instead of "mas:engineer:engineer")

INPUT=$(cat)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"

DEBUG_LOG="${HOME}/.claude/hook-debug.log"
_debug() {
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] validate-dispatch: $*" >> "$DEBUG_LOG" 2>/dev/null || true
}

if [ "$TOOL_NAME" != "Agent" ]; then
  exit 0
fi

SUBAGENT_TYPE=$(echo "$INPUT" | grep -o '"subagent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"subagent_type"[[:space:]]*:[[:space:]]*"//' | sed 's/"//')
MODEL=$(echo "$INPUT" | grep -o '"model"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"model"[[:space:]]*:[[:space:]]*"//' | sed 's/"//')

if [ -z "$SUBAGENT_TYPE" ]; then
  exit 0
fi

_debug "TOOL_NAME='${TOOL_NAME}' SUBAGENT_TYPE='${SUBAGENT_TYPE}'"

BARE_NAMES="engineer reviewer bug-fixer researcher differential-reviewer ui-ux-designer reflect-agent orchestrator"

for name in $BARE_NAMES; do
  if [ "$SUBAGENT_TYPE" = "$name" ]; then
    _debug "BLOCKED bare name: ${SUBAGENT_TYPE}"
    echo "BLOCKED: Bare agent name '$name' detected."
    echo "Use 'mas:${name}:${name}' instead."
    echo ""
    echo "Quick reference:"
    echo "  BAD:  Agent(subagent_type: \"$name\")"
    echo "  GOOD: Agent(subagent_type: \"mas:${name}:${name}\")"
    exit 2
  fi
done

if [ "$SUBAGENT_TYPE" = "mas:orchestrator:orchestrator" ]; then
  _debug "BLOCKED deprecated orchestrator"
  echo "BLOCKED: mas:orchestrator:orchestrator is DEPRECATED since v2.0."
  echo "The dev-loop command IS the orchestrator. Do not dispatch this agent."
  exit 2
fi

if [ "$SUBAGENT_TYPE" = "general" ]; then
  _debug "BLOCKED general agent"
  cat <<'BLOCKED_MSG'
BLOCKED: 'general' is not a valid dispatch in the MAS pipeline.

Use a specific agent instead:
  Discovery / codebase search:  Agent(subagent_type: "Explore")
  Implementation:                Agent(subagent_type: "mas:engineer:engineer")
  Code review:                   Agent(subagent_type: "mas:reviewer:reviewer")
  Research:                      Agent(subagent_type: "mas:researcher:researcher")
  Bug fix:                       Agent(subagent_type: "mas:bug-fixer:bug-fixer")
BLOCKED_MSG
  exit 2
fi

if [ "$SUBAGENT_TYPE" = "mas:reviewer:reviewer" ] && echo "$MODEL" | grep -qi "haiku"; then
  PROMPT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('prompt',''))" 2>/dev/null || echo "")
  DEPTH=$(echo "$PROMPT" | grep -oi 'depth:[[:space:]]*[a-z]*' | head -1 | sed 's/depth:[[:space:]]*//' | tr '[:upper:]' '[:lower:]')
  if [ "$DEPTH" != "quick" ]; then
    _debug "BLOCKED reviewer on haiku (depth=${DEPTH:-standard}): ${MODEL}"
    cat <<EOF
BLOCKED: mas:reviewer:reviewer cannot run on Haiku for standard/deep reviews.
Depth '${DEPTH:-standard}' requires minimum model: sonnet.
EOF
    exit 2
  fi
fi

REFLECT_REPORT="${CLAUDE_PROJECT_DIR}/docs/reports/reflect-report.md"
if [ "$SUBAGENT_TYPE" = "mas:reflect-agent:reflect-agent" ] && [ -f "$REFLECT_REPORT" ]; then
  _debug "BLOCKED reflect re-dispatch (report exists)"
  echo "BLOCKED: Reflect agent already ran (docs/reports/reflect-report.md exists)."
  echo "To re-run reflect, delete docs/reports/reflect-report.md first."
  exit 2
fi

_debug "ALLOWED: ${SUBAGENT_TYPE}"
exit 0
