# Meta-Rules Guide: Lessons Learned from Battle Testing

This file contains hard-won lessons from real battle testing of the MAS pipeline. Every rule here exists because the failure it prevents actually happened. Read this before writing or modifying any agent, skill, or command.

---

## The Meta-Lesson

**Prose instructions get skipped. Structural constraints don't.**

Across 10 real sessions, instructions like "you MUST dispatch sub-agents" were ignored 100% of the time. The model optimizes for getting work done and skips ceremony it deems unnecessary. The only reliable way to enforce behavior is to make the wrong behavior physically impossible (e.g., removing Bash from the Orchestrator so it cannot do inline implementation).

When writing agent instructions:
- **Don't say "you should"** — say nothing, or make it structural
- **Don't add more prose rules** — remove tools, add gates, show exact tool calls
- **Don't describe what to do** — show the exact tool invocation to copy-paste
- **Don't trust "MUST" or "NEVER"** — these are suggestions to the model, not constraints

---

## Battle Test Failures & Fixes

### 1. Skills were never invoked via the Skill tool

**What happened:** 0/10 sessions called the Skill tool. The dev-loop said "use ask-questions skill" — the model interpreted this as prose guidance and skipped it entirely. Skills like verification, finishing-branch, and writing-plans were never executed as designed.

**Root cause:** Saying "use X skill" is ambiguous — the model doesn't know whether to call `Skill(skill: "X")` or just follow the spirit of the skill.

**Fix:** Every pipeline step now shows the exact tool call: `Skill(skill: "ask-questions")`, `Skill(skill: "verification")`, etc. The model can copy-paste the invocation.

**Rule:** When referencing a skill in a command or agent, always write the exact `Skill(skill: "name")` call, never "use the X skill."

---

### 2. Orchestrator did everything inline instead of dispatching agents

**What happened:** In all sessions, Orchestrators used Bash (up to 70 calls in one session) to do implementation work inline. Zero Agent tool calls from inside the Orchestrator — ever. It read files, ran tests, wrote task specs, but never dispatched Engineer, Reviewer, or any other agent.

**Root cause:** The Orchestrator had Bash in its tool list. With Bash available, the model found it easier to do everything itself rather than compose and dispatch Agent() calls.

**Fix:** Bash was removed from the Orchestrator's tool list. Its tools are now: Read, Glob, Grep, Agent. It physically cannot run commands — its only way to get work done is dispatching agents.

**Rule:** If an agent should NOT do something, remove the tool that enables it. Don't rely on instructions saying "don't do X" — remove the ability to do X.

---

### 3. Engineer used Bash for all code changes

**What happened:** In sessions where Engineers were dispatched, they made 0 Write/Edit tool calls and 19-50 Bash calls each. All code was written via `cat <<EOF`, `echo`, `sed` heredocs. This made changes harder to review and more error-prone.

**Root cause:** The model's default instinct is to use Bash for file operations. Without explicit instructions and examples showing Write/Edit, it falls back to shell commands.

**Fix:** Engineer CLAUDE.md now has a "Tool usage rules" section that bans Bash for file writes, with BAD/GOOD example pairs showing the wrong way (cat heredoc) vs the right way (Write tool).

**Rule:** When banning a behavior, show a concrete negative example ("BAD — never do this") paired with a positive example ("GOOD — always do this"). Abstract rules are ignored; concrete examples stick.

---

### 4. Researcher and Differential Reviewer were never used

**What happened:** The model always classified tasks as "known pattern" and routed directly to Engineer. Researcher was used once across all sessions — reactively, as agent #17 of 19 — after bugs had already appeared. Differential Reviewer: 0 dispatches ever. It was a ghost role.

**Root cause:** The routing table gave the Orchestrator discretion: "Novel approach needed → Researcher" vs "Known pattern exists → Engineer directly." The model always chose "known pattern" because it's faster and requires less work.

**Fix:** Orchestrator now requires a Routing Decision Log — a one-line justification for each task explaining why it chose Engineer directly vs Researcher. Novel task criteria are made explicit: (1) no existing implementation of this pattern in codebase, (2) algorithm/approach not yet used, (3) new system boundary. Default is "if in doubt, route to Researcher."

**Rule:** When a routing decision has a "fast path" and a "thorough path," the model will always choose the fast path unless forced to justify the decision in writing. Make the thorough path the default.

---

### 5. PlanMode replaced the writing-plans skill

**What happened:** 3/5 sessions used Claude Code's built-in EnterPlanMode instead of the writing-plans skill. PlanMode produces freeform text — it does NOT produce the structured TASK-{id} breakdown with file paths, verification commands, and dependency graphs that the pipeline requires.

**Root cause:** PlanMode is a native Claude Code feature. It's always available and feels natural. The model confused "make a plan" with "enter PlanMode" because the names are similar.

**Fix:** Explicit ban on PlanMode in the dev-loop: "Do NOT use EnterPlanMode / PlanMode. PlanMode is a different mechanism." Step 4 shows the exact Skill call.

**Rule:** If a built-in feature has a similar name to a custom skill, explicitly ban the built-in and explain why the custom version is different. Name collisions cause silent substitution.

---

### 6. Cycle limits were ignored

**What happened:** Session S1 had 6 bug-fix rounds for a single task. The spec said "max 2 review cycles" — this was ignored completely. No counter was tracked, no stop mechanism existed.

**Root cause:** The limit was stated as a rule ("Max 2 review cycles per task") but had no enforcement mechanism. There was no counter variable, no escalation template, no concrete "what to do when you hit the limit" instruction.

**Fix:** Orchestrator Phase 3 now tracks `review_cycle` per task. After Bug-Fixer completes, increment the counter. If `review_cycle >= 2` and Reviewer still returns BLOCKED: STOP. Write escalation report. Move task to `docs/tasks/blocked/`. Do NOT dispatch a 3rd cycle.

**Rule:** Limits without counters and escalation procedures are just suggestions. Every limit needs: (1) a variable to track it, (2) a condition to check, (3) a concrete action when exceeded.

---

### 7. Explorer agents were dispatched ad-hoc

**What happened:** 4/5 sessions dispatched Explorer agents as their first step — before planning, before branching, before anything. This was not in the pipeline spec at all. The model felt it needed to understand the codebase before doing anything else.

**Root cause:** The model has a strong instinct to explore before acting. The pipeline started with "Clarify" (ask questions), but the model wanted to read code first. Since no Explore step existed, it improvised one.

**Fix:** Formalized as step 3 in the pipeline: "Explore — dispatch an Explore agent to scan the codebase." This legitimizes the behavior and puts it in the right place. Ad-hoc exploration elsewhere is explicitly banned.

**Rule:** If the model consistently does something that's not in the spec, consider whether there's a legitimate need. If 4/5 sessions add the same step, formalize it rather than fighting it.

---

### 8. Verification step was always skipped

**What happened:** 0/10 sessions called the verification skill. Tests were run via raw Bash commands (pnpm test, tsc --noEmit) scattered throughout the session, but the structured verification checklist was never triggered as a distinct step.

**Root cause:** By the time the model reached the verification step, it felt like it had already verified everything (tests passed during implementation). The verification step felt redundant, so it was skipped.

**Fix:** Step 8 shows the exact `Skill(skill: "verification")` call with a GATE check. The verification skill runs a structured checklist (tests, lint, typecheck, no debug artifacts) as a single pass — it catches things that ad-hoc testing misses.

**Rule:** "I already did this informally" is not the same as "I ran the structured checklist." Steps that feel redundant are often the ones that catch edge cases. Make them mandatory with gates.

---

### 9. Agent dispatch came from main session, not Orchestrator

**What happened:** The dev-loop (main session) dispatched agents directly — Engineers, Reviewers, Bug-Fixers — bypassing the Orchestrator entirely. The Orchestrator was dispatched but did read-only PM work (task specs, verification) while the main session handled all actual routing.

**Root cause:** The dev-loop had detailed dispatch instructions for each agent type. The main session, seeing these instructions, dispatched agents itself rather than delegating to the Orchestrator.

**Fix:** Dev-loop now dispatches ONLY the Orchestrator (step 6). All agent routing happens inside the Orchestrator via its dispatch templates. The dev-loop explicitly says: "Do NOT call skills or dispatch agents directly — the Orchestrator handles all routing."

**Rule:** If you give the outer loop detailed dispatch instructions, it will use them itself instead of delegating. Keep the outer loop simple: dispatch the Orchestrator and let it handle everything.

---

## Summary: Structural Fixes > Prose Rules

| Approach | Effectiveness | Example |
|----------|--------------|---------|
| "You MUST do X" | Low — ignored in 100% of sessions | "You MUST dispatch sub-agents" |
| "Do NOT do X" | Low — ignored unless paired with structural fix | "Do NOT use Bash for file writes" |
| Remove the tool | High — physically impossible to violate | Removing Bash from Orchestrator |
| Show exact tool call | Medium-High — model copies the pattern | `Agent(subagent_type: "engineer", ...)` template |
| Add file-existence gate | Medium — observable, harder to skip | "GATE: docs/tasks/done/ is non-empty" |
| BAD/GOOD example pair | Medium — concrete patterns stick better than abstract rules | BAD: `cat <<EOF`  GOOD: `Write(file_path: ...)` |
| Counter + hard stop | Medium — gives the model a variable to track | `review_cycle >= 2 → STOP` |

**When writing new agents or commands, prefer structural fixes over prose rules. If you catch yourself writing "MUST" or "NEVER", ask: can I remove a tool, add a gate, or show an example instead?**
