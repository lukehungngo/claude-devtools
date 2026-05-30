# Master Plan — SDK Upgrade + Re-enable Send Prompt + New Capabilities

**Date:** 2026-05-29
**Owner:** autonomous (goal-driven)
**Status:** IN PROGRESS

## Goal (verbatim)
1. Enable send-prompt feature again.
2. Systematically debug → find all H/M/L bugs (esp. send-prompt) → fix to **root cause**, no patches.
3. Add all new SDK capabilities / new commands. Write spec via **gsap** + **ui-ux-pro-max** skills, maintaining typography/styling/spacing/color consistency. Then implementation plan → execute → review → zero bugs. Programmatic + systematic decisions.

## Ground-truth reconnaissance (DONE)
- **SDK versions**: `@anthropic-ai/sdk` 0.96.0 → **0.100.1**; `@anthropic-ai/claude-agent-sdk` 0.3.143 → **0.3.156**.
- **Send-prompt disabled at**: `dashboard/src/components/conversation/ConversationView.tsx:909` — render removed in commit `5047a1f` ("hide prompt conversation feature until ready for release").
  - Removed JSX:
    ```jsx
    {/* Command input */}
    <PromptInput sessionCwd={sessionCwd} sessionId={sessionId} projectHash={projectHash} activeSessionId={activeSessionId} onSessionStarted={onSessionStarted} getAssistantResponses={getAssistantResponses} metrics={metrics} usage={usage} costs={costs} events={events} onOpenPanel={onOpenPanel} hasMessages={turns.length > 0} lastTurnHadError={lastTurnHadError} onStreamingEvent={streamingActions.handleSSEEvent} onStreamingReset={streamingActions.reset} />
    ```
  - Same commit `.skip`ped 2 suites in `dashboard/src/__tests__/group5-wiring.test.tsx` (onOpenPanel wiring, ghost text props wiring).
  - **Restore is clean**: all referenced identifiers (`usage`, `costs`, `getAssistantResponses`, `lastTurnHadError`, `streamingActions`, `streamingState`, `onOpenPanel`, `projectHash`) still exist in current ConversationView; `PromptInputProps` still accepts every passed prop.

## Phases
- **A. SDK Upgrade** — bump both packages, resolve breaking changes, typecheck + tests green.
- **B. Re-enable Send Prompt** — restore render, un-skip tests, wire any missing props (e.g. permissionMode), verify E2E.
- **C. Systematic Bug Hunt** — multi-lens audit of full send-prompt flow (client → server → SDK → SSE → UI). Fix to root cause.
- **D. New Capabilities** — research → spec (gsap + ui-ux-pro-max) → plan → implement → review.

## Workflow 1 output target
`docs/research/sdk-upgrade-findings.md` (consolidated, written after Workflow 1 returns).
