---
description: Bootstrap MAS Template — auto-detect stack, fill placeholders, configure hooks
---

# Bootstrap MAS Template

Install and configure the Claude Multi-Agent System for this repo. $ARGUMENTS

## Steps

0. **Copy MAS files into project** — Copy agents, skills, commands, rules, hooks, and templates from the plugin into the project's `.claude/` directory. Also copy CLAUDE.md to the project root if it doesn't exist.
   - Find the plugin cache directory at `~/.claude/plugins/cache/luke-plugins/mas/` (use the latest version subdirectory)
   - Find the plugin cache: `PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/luke-plugins/mas/*/ | sort -V | tail -1)`
   - Create `.claude/` if needed: `mkdir -p .claude`
   - For each directory (`agents`, `commands`, `skills`, `hooks`, `rules`, `templates`):
     - If the directory does NOT exist in `.claude/` → copy it entirely
     - If the directory already exists → copy only items (subdirs/files) that don't already exist. For items that DO already exist, list them and ask the user: "These already exist — overwrite with MAS versions? (y/n/pick individually)". Only overwrite if the user confirms.
   - For `settings.json`: only copy if `.claude/settings.json` does not exist
   - Log what was copied and what was skipped so the user knows
   - **Handle CLAUDE.md:**
     - If `CLAUDE.md` does NOT exist → copy the template as-is
     - If `CLAUDE.md` already exists → do NOT overwrite. Instead, read the existing file and append the **Mandatory Workflow** and **Project Type** sections from the template (the `## Mandatory Workflow` and `## Project Type` blocks) at the end, only if those sections are not already present. Preserve all existing content.
   - If the plugin cache is not found, warn the user and ask them to use the git clone method instead.

1. **Detect stack** — Read `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `Gemfile`, or `pom.xml` to identify:
   - Language and version
   - Test command (e.g., `npm test`, `pytest`, `go test ./...`)
   - Lint command (e.g., `eslint src/`, `ruff check .`, `golangci-lint run`)
   - Typecheck command (e.g., `tsc --noEmit`, `mypy .`, `go vet ./...`)
   - Build command (e.g., `npm run build`, `go build ./...`)
   - Format command (e.g., `prettier --write .`, `ruff format .`, `gofmt -w .`)
   - Key libraries and versions
   - Whether this project has a UI (`has_ui`): true if frontend framework detected (React, Vue, Svelte, Next.js, Angular, Flutter, SwiftUI, etc.)

2. **Replace all `{{placeholders}}`** across every file in `.claude/` and `CLAUDE.md`:
   - `{{PROJECT_NAME}}` → repo name or directory name
   - `{{description}}` / `{{one-line description}}` → infer from README, package.json description, or ask
   - `{{install-command}}` → detected install command
   - `{{test-command}}` → detected test command
   - `{{lint-command}}` → detected lint command
   - `{{format-command}}` → detected format command
   - `{{typecheck-command}}` → detected typecheck command
   - `{{build-command}}` → detected build command
   - `{{your tech stack}}` → detected language + key libraries
   - `{{true | false}}` for `has_ui` → detected from framework
   - Leave `{{Invariant X}}`, `{{Gotcha X}}`, and core flow placeholders as-is (project-specific, human fills these)

3. **Fix hooks** — Update `lint.sh` and `pre-stop-gate.sh` with the detected lint/test commands. Run `chmod +x .claude/hooks/*.sh`.

4. **Create output directories:**

   ```bash
   mkdir -p docs/mas
   mkdir -p tasks/{pending,in-progress,done,blocked}
   ```

5. **Verify** — Run:

   ```bash
   grep -r '{{' .claude/ CLAUDE.md --include='*.md' --include='*.sh' --include='*.json' | grep -v 'Invariant\|Gotcha\|step\|Describe your'
   ```

   If any non-intentional placeholders remain, fill them.

6. **Critical: Verify testing framework** — Check if a testing framework was detected (test command is not empty/placeholder). If NO testing framework is found:

   ```
   ⚠️  WARNING: NO TESTING FRAMEWORK DETECTED
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TDD is non-negotiable in this workflow. Without a testing
   framework, the following WILL NOT WORK:

     - /dev-loop (TDD enforced at every task)
     - /test-driven-development
     - /subagent-driven-development (two-stage review requires tests)
     - Engineer agent (refuses to implement without tests)
     - Reviewer agent (blocks on missing test coverage)

   ACTION REQUIRED: Install a testing framework before using
   any MAS workflow. Examples:
     - Node.js:  npm install -D vitest (or jest)
     - Python:   pip install pytest
     - Go:       (built-in, check go.mod exists)
     - Rust:     (built-in, check Cargo.toml exists)

   Then re-run /bootstrap to update the test command.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

   **Do NOT suppress this warning.** Display it prominently before the summary.

7. **Report** — Print a summary:

   ```
   MAS Template bootstrapped for: {project name}
   Stack: {language} + {framework}
   has_ui: {true/false}
   Agents: 7 (6 active + ui-ux-designer conditional)
   Skills: 13 | Commands: 4 | Rules: 4 | Hooks: 2

   All skills and agents are now local — use /ask-questions, /dev-loop, etc. without prefix.

   Remaining TODOs:
     - Fill Architecture Invariants in CLAUDE.md
     - Fill Core Flow in CLAUDE.md
     - Fill Key Gotchas in CLAUDE.md

   Ready to go? Try one of these:
     /dev-loop <describe your first task>
     /new-feature <feature name>
     /ask-questions <what you want to build>
   ```
