# Research: `@anthropic-ai/sdk` 0.96.0 → 0.100.1

**Date:** 2026-05-29
**Package:** `@anthropic-ai/sdk`
**Installed (baseline):** `0.96.0` (`server/package.json:18` → `"^0.96.0"`)
**Target:** `0.100.1` (latest as of 2026-05-29)
**How this package is used in claude-devtools:** Direct dependency, used ONLY as a fallback path for AI report synthesis in `server/src/http/routes/efficiency-routes.ts:150` (`const { default: Anthropic } = await import("@anthropic-ai/sdk")`). The primary AI path is `@anthropic-ai/claude-agent-sdk` via `SessionManager`. The SDK's *types* (e.g. `Usage`, `Model`, content blocks) are NOT directly imported by the parser/analyzer — claude-devtools defines its own JSONL shapes in `server/src/types.ts`.

## Method / Sources

- WebFetch was blocked in this environment by the context-mode plugin, and context-mode MCP tools are prohibited by the task. Used `gh api repos/anthropics/anthropic-sdk-typescript/contents/...` (GitHub REST, local `gh` CLI) to read the canonical `CHANGELOG.md` and `src/resources/messages/messages.ts` from the `main` branch.
- Read local baseline changelog: `server/node_modules/@anthropic-ai/sdk/CHANGELOG.md` (confirms ≤0.96 history).
- Cross-checked the installed baseline type at `server/node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:1483` (`interface Usage`) to prove what is NEW vs pre-existing.

---

## Version-by-version changelog (0.97.0 → 0.100.1)

### 0.100.1 (2026-05-29)
- **Bug Fix — streaming:** carry `encrypted_content` on beta compaction blocks (#1025). Relevant if/when consuming beta context-compaction streaming events.
- **Chore:** update lockfiles for proper `standardwebhooks` dependency.

### 0.100.0 (2026-05-28)
- **Feature — api:** Add support for **`claude-opus-4-8`**, **mid-conversation system blocks**, and **`usage.output_tokens_details`** (commit `bb0bf27`). *This is the most relevant release for claude-devtools.*
- **Docs:** replace literal newlines.

### 0.99.0 (2026-05-27)
- **Feature:** support custom file size caps (#1029) — Files API upload limit tuning.
- **Bug Fix — streaming:** carry `stop_details` through `message_delta` accumulation (#1027). Affects stream accumulators that need the final `stop_details`/`stop_reason` detail.

### 0.98.1 (2026-05-26)
- **Bug Fix — client:** preserve directory prefix in `skills.versions.create` uploads (#1024).
- **Chores:** swap to Trusted Publishing; rename a Managed Agents example.

### 0.98.0 (2026-05-21)
- **Feature — api:** Add support for the **`thinking-token-count` beta** — emits *estimated tokens in thinking-block deltas when streaming* (commit `0528d47`). Pairs with the `output_tokens_details.thinking_tokens` field added in 0.100.0.

### 0.97.1 (2026-05-19)
- **Bug Fix — runner:** `SessionToolRunner` skips tool calls it does not own (`9987379`). Tool-execution-loop correctness fix.

### 0.97.0 (2026-05-19)
- **Feature — client:** Add support for **self-hosted sandboxes in CMA (Claude Managed Agents)** with sandbox helpers (`659a343`).
- **Bug Fix — typescript:** upgrade `tsc-multi` to work with **Node 26** (`623f71c`).
- **Chore:** remove redundant `File` import in tests.

---

## BREAKING changes (0.96 → 0.100.1)

**None identified.** All releases in this window are minor/patch (0.97–0.100) and the changelog shows only Features / Bug Fixes / Chores / Docs — no `BREAKING CHANGE` entries and no major-version bump. The upgrade is additive:

- `Usage` gains a new **optional/nullable** field `output_tokens_details: OutputTokensDetails | null` (verified: baseline `messages.d.ts:1483` has no such field; main branch `messages.ts:2294` adds it). Additive, nullable → no compile break for existing code reading `usage.output_tokens`.
- The request `content` union gains `MidConversationSystemBlockParam` (main `messages.ts:827`). Additive to an input union → does not break existing producers.
- The `Model` union adds `'claude-opus-4-8'` (and the union already includes `'claude-opus-4-7'`, `'claude-mythos-preview'`, `'claude-opus-4-6'`, `'claude-sonnet-4-6'`, `'claude-haiku-4-5'`). Adding members to a string-literal union is additive; existing model strings still type-check.

> Caveat: a `^0.96.0` range will NOT auto-resolve to `0.100.x` because 0.x ranges treat the minor as the API surface (`^0.96.0` ≈ `>=0.96.0 <0.97.0`). To pick up these features you must bump the dependency explicitly (e.g. `^0.100.1`). Action item, not a code break.

---

## NEW features / APIs and relevance to claude-devtools

### 1. `usage.output_tokens_details.thinking_tokens` (0.100.0) — HIGH relevance
- **SDK shape** (main `messages.ts:1233`):
  ```ts
  export interface OutputTokensDetails { thinking_tokens: number; }
  // Usage now has:
  output_tokens_details: OutputTokensDetails | null;
  ```
- Docs note: `thinking_tokens` is the raw internal-reasoning token count (incl. thinking-block delimiters), always ≤ `output_tokens`; `output_tokens - thinking_tokens` ≈ non-reasoning output. `output_tokens` remains the authoritative billing total.
- **Relevance:** claude-devtools' core job is parsing JSONL `usage` and computing token/cost metrics. Today `server/src/analyzer/metrics.ts:200` only reads `usage.output_tokens`, and `server/src/types.ts:430` (`TokenUsage`) has no thinking breakdown. If Claude Code writes `output_tokens_details` into its JSONL `usage` objects (the SDK type confirms the API now returns it), claude-devtools can surface a reasoning-vs-output token split WITHOUT any extra cost (it's a read-only decomposition of already-billed tokens).
- **uiOpportunity:** Add a "reasoning tokens" sub-metric on session/insights token tiles — e.g. "X% of output spent on thinking." Could feed a new efficiency hint (extended-thinking overuse) since the codebase already has `model-overuse.ts` and per-session token analysis.

### 2. `thinking-token-count` streaming beta (0.98.0) — MEDIUM relevance
- Streams *estimated* thinking-token counts inside thinking-block deltas during streaming. Complements field #1 for live sessions.
- **Relevance:** For active sessions started in the dashboard (`SessionManager` → SSE), this could let the UI show a live "thinking N tokens…" counter while the model reasons, before the final `output_tokens_details` lands. Note: claude-devtools' live path goes through `@anthropic-ai/claude-agent-sdk`, so realizing this depends on the agent SDK exposing the beta — the direct SDK only matters for the fallback report path (`efficiency-routes.ts:152` `client.messages.stream(...)`).
- **uiOpportunity:** Live "thinking…" token ticker in the session viewer / report stream. Lower priority than #1.

### 3. `claude-opus-4-8` model support (0.100.0) — MEDIUM relevance
- New `Model` union member `'claude-opus-4-8'` (main `messages.ts`). The union now spans opus-4-8/4-7/4-6, sonnet-4-6, haiku-4-5, and `claude-mythos-preview`.
- **Relevance:** Pricing/cost correctness. `server/src/analyzer/modelPricing.ts:22` (`FALLBACK_MODEL_PRICING`) currently only lists `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` — it has NO entry for `claude-opus-4-8`, `claude-opus-4-7`, or `claude-mythos-preview`. Per Frontend Rule #6 / Architecture Invariant #9 (data integrity), if users run opus-4-8 sessions, cost computation will fall through to defaults/zeros and under/over-report spend. This is a data-correctness gap independent of bumping the SDK — pricing must be added when the rate card is published.
- **uiOpportunity:** Model-mix charts on InsightsPage will show `claude-opus-4-8`; ensure it has a color/label and correct $/token so cost tiles stay accurate.

### 4. Mid-conversation system blocks — `MidConversationSystemBlockParam` (0.100.0) — LOW relevance
- **SDK shape** (main `messages.ts:1179`): `{ type: 'mid_conv_system'; content: Array<TextBlockParam>; cache_control?: ... }`. Lets callers inject/update system instructions at a point in the message list instead of only the top-level `system` param.
- **Relevance:** This is a *request-side* (input) feature. claude-devtools is read-only/observability and only sends one simple `system` + `messages` request in the fallback report path. Low direct value. Minor parsing relevance: if Claude Code sessions start using `mid_conv_system` blocks, the JSONL message-content parser in `server/src/types.ts` (`ContentItem` union) and the turn renderer may encounter an unrecognized block type and should degrade gracefully (it already follows fail-safe parsing).
- **uiOpportunity:** Optional — render mid-conversation system blocks distinctly in the session viewer if they appear in JSONL.

### 5. Streaming accumulator fixes — `stop_details` (0.99.0) & `encrypted_content` on compaction blocks (0.100.1) — LOW relevance
- 0.99.0 carries `stop_details` through `message_delta` accumulation; 0.100.1 carries `encrypted_content` on beta compaction blocks during streaming.
- **Relevance:** Only matters for the fallback streaming report path (`efficiency-routes.ts:152-164`), which reads `content_block_delta`/`text_delta` and ignores `stop_details`/compaction. No action needed unless that path starts consuming stop metadata or context-compaction.

### 6. Self-hosted sandboxes in CMA + sandbox helpers (0.97.0) — NOT relevant
- Claude Managed Agents server-side sandbox execution. Out of scope for an observability dashboard; the project does not use CMA.

### 7. Custom file size caps (0.99.0) — NOT relevant
- Files API upload-limit tuning. claude-devtools does not upload files via this SDK.

### 8. Node 26 / `tsc-multi` toolchain fix (0.97.0) — LOW (hygiene)
- Ensures the SDK's own build works on Node 26. Worth noting for CI/runtime if the team moves to Node 26; not a consumer API change.

---

## Recommendation (summary)

1. **Bump `@anthropic-ai/sdk` to `^0.100.1`** — additive, no breaking changes. Run `npx tsc --noEmit` in `server/` to confirm (expected clean).
2. **Add `claude-opus-4-8` (and `claude-opus-4-7`) pricing** to `server/src/analyzer/modelPricing.ts` and the dashboard `MODEL_PRICING` mirror (`dashboard/.../lib/cost.ts`) when the official rate card is available — this is a data-integrity P-issue regardless of the SDK bump.
3. **Consider surfacing `output_tokens_details.thinking_tokens`** — extend `TokenUsage` in `server/src/types.ts:430`, capture it in `computeMetrics()` (`metrics.ts:200`), and add a reasoning-token sub-metric/efficiency hint. Highest-value new UI opportunity; zero extra API cost since it decomposes already-billed output tokens.
4. Treat mid-conversation system blocks and the streaming fixes as awareness-only for now; ensure JSONL parsing stays fail-safe on the new `mid_conv_system` block type.
