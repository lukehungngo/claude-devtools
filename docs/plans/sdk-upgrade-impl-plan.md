# Implementation Plan — SDK Upgrade, Send-Prompt Re-enable, Bug Fixes, New Capabilities

**Date:** 2026-05-29 · **Status:** EXECUTING · **Source research:** `docs/research/*.md`

## Decisions (programmatic, documented — no user prompt per full-autonomy directive)
- **D1 — SDK bumps are safe.** Both `@anthropic-ai/sdk` (0.96→0.100.1) and `claude-agent-sdk` (0.3.143→0.3.156) are fully additive, no breaking changes touching our code. Bump explicitly (caret `^0.96`/`^0.3.143` won't float to target). Regenerate root + stale `server/pnpm-lock.yaml`. Gate = `tsc --noEmit` + tests + manual re-read of 6 cast sites.
- **D2 — Re-enabling send-prompt requires the P1 fixes.** Restoring the bare render ships a frozen-spinner / swallowed-error / lost-permission-mode experience. "Enable again" = enable AND make it correct (no patch). Bundle the P1 send-prompt fixes into Phase B.
- **D3 — AskUserQuestion: IMPLEMENT, not remove.** Client is fully wired (`AppLayout`, `useUnifiedWebSocket`, `/questions/:id/answer`); only the server bridge is missing. Removing a near-complete differentiator contradicts "fix broken first". Wire it end-to-end.
- **D4 — opus-4-8 pricing: verify, never guess** (Invariant #9, NO GUESS WORK). Fetch official rate card before adding `claude-opus-4-8`/`-4-7` to `modelPricing.ts` + dashboard `cost.ts` mirror. If unverifiable, flag as `// est., not verified` and surface honestly.
- **D5 — New capabilities prioritized by leverage** (Phase D), spec'd with `ui-ux-pro-max` + `gsap` skills, maintaining existing `dt-*` token system (typography/spacing/color consistency is a hard constraint).

---

## Phase A — SDK Upgrade  *(low risk, unblocks all)*
- A1. `server/package.json`: `@anthropic-ai/sdk` `^0.96.0`→`^0.100.1`; `@anthropic-ai/claude-agent-sdk` `^0.3.143`→`^0.3.156`.
- A2. root `package.json`: `@anthropic-ai/claude-agent-sdk` `^0.3.143`→`^0.3.156`.
- A3. `pnpm install` (regenerate root + server locks; pulls 8 native variants).
- A4. **Gate:** `cd server && npx tsc --noEmit` + `pnpm -C server test` + `pnpm -C dashboard test` + `npx tsc --noEmit` (dashboard).
- A5. Manually re-read 6 cast sites vs new `sdk.d.ts` (session-manager.ts:261,389,78,274-275; sse-event-handler.ts:399-409; test Query stubs).

## Phase B — Re-enable Send Prompt + make it correct  *(TDD)*
- B1. **P1** Add `permissionMode` prop to `PromptInputProps`; apply on session create/resume + on the first message (POST `/permission-mode` after create). [audit-client P1-C3]
- B2. **P1** Add `onBashOutput` to `ConversationViewProps`, thread from SessionPage, render `BashOutputBlock` in stream. [P1-C4]
- B3. **P1** Surface `error` (+ `rate_limit`/`api_retry`) SSE frames in PromptInput loop + add `useStreamingState` cases. [P1-C1 / S3 / S4]
- B4. **P1** Reset/finalize streaming state on `result`, `done`, and abort (Stop/Ctrl+C). Gate "Working..." on active stream only. [P1-C2 / P2-C6]
- B5. **P1** Fix double-abort race: request-local `finished` flag so `res.on("close")` only aborts on real disconnect. [server P1-S1]
- B6. **P1** Implement AskUserQuestion server bridge end-to-end (resolver registration + `user-question` broadcast + answer feedback). [server P1-S2] (D3)
- B7. **P2** Reject double-submit with 409 before `flushHeaders()`. [server P2-S5]
- B8. **P2** Un-skip 2 `group5-wiring` suites; resolve dead `lastTurnHadError` (remove prop+scan OR re-enable branch). [P2-C7]
- B9. **Restore** `<PromptInput .../>` render at `ConversationView.tsx:909` + the two new props.
- B10. **Gate:** dashboard+server tests green, tsc green, manual E2E (start session → send → stream → error path → abort → permission mode).

## Phase C — Remaining bug fixes  *(TDD)*
- C1. **P2** Validate `images` at API boundary with Zod (count, size, mediaType allowlist, base64). [server P2-S6]
- C2. **P3** `tool_delta` carry block `id`/`index`; key reducer by it (parallel tool_use). [client P3-C8]
- C3. **P3** bash route: reject empty Origin / gate behind opt-in. [server P3-S7]
- C4. **P3** `summarizeUpTo` drain: report failure to client (status/error WS). [server P3-S8]
- C5. Audit remaining unhandled SSE types (`init`/`tool_summary`/`prompt_suggestion`/`command_output`): wire or stop emitting. [P2-S4]

## Phase D — New capabilities  *(spec → plan → build → review; ui-ux-pro-max + gsap)*
**Tier 0 (zero/low server work, high leverage):**
- D-a. Full permission-mode cycle in composer (`acceptEdits`/`bypassPermissions`/`auto`/`dontAsk` — modes already in `session-manager.ts:100`). [cc #9]
- D-b. `output_tokens_details.thinking_tokens` observability metric — extend `TokenUsage`, capture in `computeMetrics`, reasoning-token sub-metric + efficiency hint. [anthropic-sdk #1] (HIGH value, additive)
- D-c. opus-4-8 pricing correctness. (D4)
**Tier 1:**
- D-d. Richer rewind/checkpoint modes (4 restore modes + summarize) as a visual timeline. [cc #3]
- D-e. Unified model+effort picker (per-session vs default, adaptive thinking, 1M-context, `auto`). [cc #8]
- D-f. Multi-session monitor / `/bg` background-session surface ("web Agent View"). [cc #2]
**Tier 2:**
- D-g. `/sandbox` status+toggle, `/goal` loop visualization, `/security-review`, `/code-review --fix`, `/branch` graph, `/feedback` w/ session attach, `/plugin` panel. [cc #1,4,5,6,7,11,12,13]

Spec + plan written before Tier work; each tier reviewed (adversarial) before merge. Visual consistency (dt-* tokens) is a P0 acceptance gate.
