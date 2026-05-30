// Local mirror of @anthropic-ai/claude-agent-sdk `HOOK_EVENTS`.
//
// Why: importing the SDK value into the dashboard pulls sdk.mjs (which begins
// with a `#!/usr/bin/env node` shebang) into Vite's parse tree and fails the
// dashboard build. The SDK is a server-side dep. A parity test in
// HookEditor.test.tsx asserts this array matches the SDK so drift is loud.
export const HOOK_EVENTS_LOCAL = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "Notification",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "SessionStart",
  "SessionEnd",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "PermissionRequest",
  "PermissionDenied",
  "Setup",
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
  "Elicitation",
  "ElicitationResult",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
  "InstructionsLoaded",
  "CwdChanged",
  "FileChanged",
  "MessageDisplay",
] as const;

export type HookEventName = (typeof HOOK_EVENTS_LOCAL)[number];
