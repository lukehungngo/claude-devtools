# Lessons Learned — 2026-03-29 Development Session

**Session scope:** Bug fixes, Tier 1-3 implementation, cleanup, post-audit restructure
**Duration:** Full day (~12+ hours)
**Output:** 3 PRs merged (#7, #8, #9), 735 tests, 44 features + 11 bug fixes

---

## Lesson 1: "Done" Does Not Mean "Works End-to-End"

**What happened:** We implemented image paste (T2-15), /fast toggle (T2-09), and SSE streaming. All three were marked "DONE" in the OKR. Post-audit found:
- Image paste: client captures images, server silently drops them (never reads `images` from request body)
- /fast: flag stored in session state, never passed to SDK `query()` call
- SSE: only forwards `text_delta` — tool calls, thinking, and progress events all silently dropped

**Root cause:** Each feature was tested in isolation. "Does the UI show the image preview?" → yes → mark done. Nobody tested the full chain: client → server → SDK → Claude → response. The server endpoint and SDK integration were never verified.

**Rule:** A feature is DONE only when there is an end-to-end test proving data flows from user action to final effect. For any feature that crosses client/server/SDK boundary:
1. Test the full chain, not just the UI
2. Verify the server actually reads what the client sends
3. Verify the SDK actually receives what the server passes
4. If you can't test it end-to-end in CI, at minimum document the manual verification steps

**How to apply:** Before marking any feature "DONE" in the OKR, ask: "If a user does X, does Y actually happen?" Not "does the code exist" but "does it work."

---

## Lesson 2: Read-Only Viewers Named as "Editors" Inflate Parity

**What happened:** We created `HookEditor.tsx`, `MemoryEditor.tsx`, and `SettingsPanel.tsx`. All three are read-only viewers — they display data but cannot modify it. The OKR counted them as implemented features.

**Root cause:** The task specs said "view and edit hooks from web UI" but the implementation only did "view." The reviewer didn't catch this because the component existed, had tests, and rendered correctly. The name "Editor" masked the gap.

**Rule:** Name components honestly. A read-only viewer is a "Viewer," not an "Editor." When a task spec says "view AND edit," the acceptance criteria must explicitly require both:
- AC1: Displays data (read)
- AC2: User can modify data (write)
- AC3: Modified data persists (server round-trip)

If you only implement read, mark the task as PARTIAL, not DONE.

**How to apply:** During review, check: does the component name match its capability? Does the OKR status match the actual functionality?

---

## Lesson 3: SSE Event Forwarding is a P0 for Interactive Tools

**What happened:** The SSE handler in `routes.ts` was written to forward text streaming output. This was sufficient for viewing Claude's text responses. But for interactive coding, Claude spends most of its time calling tools (Read, Edit, Bash, Glob, Grep). The SSE handler drops all tool events, making the user blind to 60% of Claude's activity.

**Root cause:** The SSE handler was built for the "observability viewer" use case (just show the text), not the "interactive coding client" use case (show everything Claude does in real-time). The architecture shifted from viewer to client, but the SSE handler wasn't updated.

**Rule:** When the product vision shifts, audit ALL data paths for the new use case. Specifically:
- List every event type the SDK emits
- Verify every event type is forwarded through the real-time path
- If an event type is intentionally dropped, document WHY

**How to apply:** For any SSE/WebSocket handler, maintain an explicit "event type coverage" table showing which SDK events are forwarded and which are dropped.

---

## Lesson 4: Parity Claims Must Be Verified Against Source Code

**What happened:** The production audit claimed ~75% CLI parity. Post-audit source code verification found ~39-58%. The gap came from:
- Counting partial features as complete
- Counting broken features as working
- Not accounting for new CLI features added since the original gap analysis
- Counting read-only panels as "editors"

**Root cause:** The parity estimate was based on task completion status, not source code verification. "Task T2-15 (image paste) is DONE" → count as working. Nobody ran `grep` on the server to verify images were actually passed to the SDK.

**Rule:** Parity claims must be verified by reading source code, not by reading task status. Specifically:
1. For each "DONE" feature, read the implementation to verify it works
2. Run a differential review (second pair of eyes) for critical claims
3. Update parity estimates only after source code verification
4. Never trust OKR checkboxes — trust `grep`

**How to apply:** Schedule periodic source code audits. Don't let OKR status diverge from reality.

---

## Lesson 5: Parallel Agent Dispatch Can Create Integration Gaps

**What happened:** Tier 3 dispatched 5 engineer agents in parallel. Each agent worked in isolation on different files. All 5 succeeded individually (tests pass, TypeScript clean). But the reviewer found GROUP-5's panels were unreachable from the UI — the `onOpenPanel` callback was never wired from ConversationView to PromptInput.

**Root cause:** Agent 5 added `onOpenPanel` as a prop to PromptInput, and Agent 4 modified the right panel tabs. Neither agent knew the other's changes needed to be connected. The integration point fell between two agents' scopes.

**Rule:** When dispatching parallel agents that touch overlapping component trees, explicitly document integration points in the task spec:
- "After implementing DoctorPanel, verify it is reachable from PromptInput's /doctor command"
- "After adding the onOpenPanel prop, verify ConversationView passes it through"

Or better: designate one agent as the "integration agent" that wires up cross-group connections after all others complete.

**How to apply:** For parallel dispatch, add an "integration checklist" to the plan. After all agents complete, verify every cross-component connection before review.

---

## Lesson 6: Heuristic Detection Gets Replaced by Proper Signals

**What happened:** Turn completion was detected using `isLastTurn && !turn.endTime` — a heuristic that broke when users queued prompts. After research, we discovered `system subtype=turn_duration` as the definitive signal (31 turns analyzed, 100% reliable vs 94% for the heuristic).

**Root cause:** The heuristic was "good enough" initially and nobody questioned it until the user pointed out the edge case.

**Rule:** When detecting state transitions, always prefer explicit signals over heuristics:
1. Research what signals the upstream system (Claude Code JSONL) actually emits
2. Verify signal reliability against real data (not assumptions)
3. Document the chosen signal and why alternatives were rejected
4. Don't add fallback heuristics — they mask the real signal's failure and create confusing behavior

**How to apply:** For any "how do we detect X" question, start with: "What does the data source explicitly tell us?" before inventing detection logic.

---

## Lesson 7: console.log Must Die Before Structured Logging

**What happened:** We added pino structured logging as a formal system. But `console.log/warn/error` calls persisted in 6+ files for weeks. The cleanup kept getting deferred ("we'll do it in the next session"). The mixed logging made debugging harder because some events went to pino (structured, searchable) and some to console (unstructured, lost).

**Root cause:** Adding a new logging system doesn't automatically remove the old one. Old patterns persist through inertia.

**Rule:** When introducing structured logging:
1. Add a lint rule or grep check that fails on `console.log/warn/error` in server source files
2. Clean up ALL existing console calls in the same PR that adds structured logging
3. Exception: MCP servers using stdio transport may use `console.error` (it's stderr, not logging)

**How to apply:** Run `grep -r "console\.\(log\|warn\|error\)" server/src/ --include="*.ts" | grep -v test | grep -v index.ts` as a pre-commit check.

---

## Lesson 8: Security Fixes Must Be Caught in First Review, Not Audit

**What happened:** Two security issues were found during audit, not during initial implementation:
1. `execSync(\`${editor} "${filePath}"\`)` — shell injection via EDITOR env var
2. `resolvedTarget.startsWith(resolvedCwd)` — path traversal allowing sibling directory access (needed `+ path.sep`)

**Root cause:** Security review was not part of the standard review cycle. Reviewers checked for functionality and code quality but not for injection vectors.

**Rule:** Every review of code that handles:
- User input → shell execution: check for injection (use `spawnSync` with array args, never `execSync` with interpolation)
- File paths: check for traversal (`startsWith(base + path.sep)`, not just `startsWith(base)`)
- External data → database: check for SQL injection (use parameterized queries)

**How to apply:** Add a "Security Checklist" to the reviewer prompt. For any code touching user input, file paths, or shell commands, the reviewer must explicitly check OWASP top 10 patterns.

---

## Lesson 9: Feature Count != User Value — Focus on Workflows

**What happened:** We implemented 44 features across 3 tiers and claimed high CLI parity. But post-audit found the core workflow (send prompt → see Claude work → see results) was broken because SSE didn't forward tool events. We had many features but the fundamental use case didn't work.

**Root cause:** We optimized for feature count (OKR checkboxes) instead of workflow completeness. Adding /doctor, /stats, and prompt suggestions before fixing the core SSE stream was backwards prioritization.

**Rule:** Prioritize by workflow, not by feature count:
1. Define the core user workflow (for this project: "send coding prompt → watch Claude work → see results → iterate")
2. Ensure the core workflow is 100% functional before adding ancillary features
3. Test the core workflow end-to-end after every batch of changes
4. A product with 10 working features on a solid core is better than 44 features on a broken core

**How to apply:** Before starting any new tier, run the core workflow manually. If it breaks, fix it first.

---

## Lesson 10: Audit Reports Must Be Diffed Against Implementation

**What happened:** The initial production audit (docs/reports/production-audit-2026-03-29.md) claimed "Tier 1 + Tier 2 complete. Web client replaces CLI with observability advantage." The post-audit (combined-audit) found this was misleading. The difference: the initial audit checked "does code exist?" while the post-audit checked "does code work end-to-end?"

**Root cause:** Different standards of "done." Existence != functionality.

**Rule:** Audit reports must specify their verification methodology:
- **Code existence audit:** "This file exists and has tests" (low confidence)
- **Functional audit:** "This feature works when I trace the code path end-to-end" (medium confidence)
- **Manual test audit:** "I ran this feature and verified the output" (high confidence)

Never claim parity based on code existence alone.

**How to apply:** Every audit report must state its methodology in the header and use appropriate confidence language.

---

## Summary: Top 3 Rules to Internalize

1. **"Done" means end-to-end verified, not "code exists."** Test the full chain: UI → server → SDK → effect.
2. **Fix broken before adding new.** A broken feature erodes trust more than a missing feature.
3. **Audit against source code, not task status.** `grep` is the source of truth, not OKR checkboxes.
