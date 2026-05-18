# Conversation Panel Text Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard conversation panel text comfortably readable by bumping the four custom utility classes (`.t-body`, `.t-mono*`) and sweeping inline numeric `fontSize` values inside `components/conversation/*` by +2px (capped at 15).

**Architecture:** No runtime/behavior change. Pure CSS + numeric-literal edits. A single static guard test asserts the new CSS sizes are present. Visual verification confirms layout integrity across the conversation panel.

**Tech Stack:** CSS (Tailwind-augmented), TSX inline styles, Vitest static file-read test.

**Substitution table** (used in every sweep task):

| Before | After |
|---|---|
| `fontSize: 9` | `fontSize: 11` |
| `fontSize: 10` | `fontSize: 12` |
| `fontSize: 11` | `fontSize: 13` |
| `fontSize: 12` | `fontSize: 14` |
| `fontSize: 13` | `fontSize: 15` |
| `fontSize: 14+` | _unchanged_ |

---

### Task 1: Add the static guard test (TDD)

**Files:**
- Create: `dashboard/src/styles/globals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/styles/globals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname_ = dirname(__filename);
const css = readFileSync(join(__dirname_, "globals.css"), "utf8");

function blockFor(selector: string): string {
  const idx = css.indexOf(selector + " {");
  if (idx < 0) throw new Error(`selector not found: ${selector}`);
  const end = css.indexOf("}", idx);
  return css.slice(idx, end);
}

describe("conversation text utility classes — readability sizes", () => {
  const cases: Array<[string, string]> = [
    [".t-body",     "font-size: 15px"],
    [".t-mono",     "font-size: 13px"],
    [".t-mono-sm",  "font-size: 12px"],
    [".t-mono-xs",  "font-size: 11px"],
  ];
  for (const [cls, decl] of cases) {
    it(`${cls} declares ${decl}`, () => {
      expect(blockFor(cls)).toContain(decl);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dashboard && pnpm vitest run src/styles/globals.test 2>&1 | tail -10
```

Expected: FAIL — 4 assertions fail because globals.css still has 13/11/10/9 px values.

- [ ] **Step 3: Commit the failing guard test**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/styles/globals.test.ts
git commit -m "test(readability): add static guard for .t-body/.t-mono* sizes"
```

---

### Task 2: Bump the four utility classes in `globals.css`

**Files:**
- Modify: `dashboard/src/styles/globals.css` (lines 607-670 approximately)

- [ ] **Step 1: Apply the four edits**

Each edit changes the `font-size` value (and `line-height` where it's px-valued):

```css
/* .t-body  — line 607 */
.t-body {
  font-family: var(--font-sans);
  font-size: 15px;        /* was 13px */
  line-height: 1.65;
  color: var(--t1);
}

/* .t-mono  — line 649 */
.t-mono {
  font-family: var(--font-mono);
  font-size: 13px;        /* was 11px */
  line-height: 18px;      /* was 16px */
  color: var(--t1);
}

/* .t-mono-sm — line 657 */
.t-mono-sm {
  font-family: var(--font-mono);
  font-size: 12px;        /* was 10px */
  line-height: 16px;      /* was 14px */
  color: var(--t2);
}

/* .t-mono-xs — line 665 */
.t-mono-xs {
  font-family: var(--font-mono);
  font-size: 11px;        /* was 9px */
  line-height: 14px;      /* was 12px */
  color: var(--t3);
}
```

- [ ] **Step 2: Run the guard test to verify it passes**

```bash
cd dashboard && pnpm vitest run src/styles/globals.test 2>&1 | tail -8
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/styles/globals.css
git commit -m "feat(readability): bump .t-body/.t-mono*/.t-mono-sm/.t-mono-xs +2px"
```

---

### Task 3: Sweep `ToolEntries.tsx`

**Files:**
- Modify: `dashboard/src/components/conversation/ToolEntries.tsx`

Audit found 10 inline `fontSize` occurrences at values 9 / 10 / 11.

- [ ] **Step 1: List current state**

```bash
grep -nE "fontSize:\s*(9|10|11|12|13)\b" dashboard/src/components/conversation/ToolEntries.tsx
```

Expected: ~10 lines, each matching the substitution table.

- [ ] **Step 2: Apply the lookup-table sweep**

Use Edit per occurrence. The values to change (per the audit):

- Line 435: `fontSize: 10` → `fontSize: 12`
- Line 468: `fontSize: 11` → `fontSize: 13`
- Line 493: `fontSize: 11` → `fontSize: 13`
- Line 505: `fontSize: 11` → `fontSize: 13`
- Line 563: `fontSize: 11` → `fontSize: 13`
- Line 576: `fontSize: 11` → `fontSize: 13`
- Line 586: `fontSize: 11` → `fontSize: 13`
- Line 593: `fontSize: 9` → `fontSize: 11`
- Line 617: `fontSize: 11` → `fontSize: 13`
- Line 631: `fontSize: 11` → `fontSize: 13`

Use Edit with `replace_all=true` for the bulk-replace where the surrounding context is identical, e.g.:

```
old_string: "fontSize: 11"
new_string: "fontSize: 13"
replace_all: true
```

If `replace_all` complains about ambiguity, do per-line Edits with enough context to disambiguate.

- [ ] **Step 3: Verify no remaining 9/10/11 fontSize values**

```bash
grep -nE "fontSize:\s*(9|10|11)\b" dashboard/src/components/conversation/ToolEntries.tsx
```

Expected: no output.

- [ ] **Step 4: Run the affected test file**

```bash
cd dashboard && pnpm vitest run ToolEntries.test 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/components/conversation/ToolEntries.tsx
git commit -m "feat(readability): bump ToolEntries inline fontSize +2px"
```

---

### Task 4: Sweep `TaskGrid.tsx`

**Files:**
- Modify: `dashboard/src/components/conversation/TaskGrid.tsx`

- [ ] **Step 1: List current state**

```bash
grep -nE "fontSize:\s*(9|10|11|12|13)\b" dashboard/src/components/conversation/TaskGrid.tsx
```

Expected: 6 lines at value 9.

- [ ] **Step 2: Apply the sweep**

Use Edit with `replace_all=true`:

```
old_string: "fontSize: 9"
new_string: "fontSize: 11"
replace_all: true
```

- [ ] **Step 3: Verify no remaining 9/10/11 fontSize values**

```bash
grep -nE "fontSize:\s*(9|10|11)\b" dashboard/src/components/conversation/TaskGrid.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/components/conversation/TaskGrid.tsx
git commit -m "feat(readability): bump TaskGrid inline fontSize +2px"
```

---

### Task 5: Sweep `RawLogView.tsx`

**Files:**
- Modify: `dashboard/src/components/conversation/RawLogView.tsx`

- [ ] **Step 1: List current state**

```bash
grep -nE "fontSize:\s*(9|10|11|12|13)\b" dashboard/src/components/conversation/RawLogView.tsx
```

Expected: 5 lines at values 9 / 10 / 11.

- [ ] **Step 2: Apply the sweep**

Per the lookup table — apply each substitution. Since multiple values exist, do them as ordered Edits with `replace_all=true`:

```
old_string: "fontSize: 11"
new_string: "fontSize: 13"
replace_all: true
```

```
old_string: "fontSize: 10"
new_string: "fontSize: 12"
replace_all: true
```

```
old_string: "fontSize: 9,"
new_string: "fontSize: 11,"
replace_all: true
```

Note the `,` suffix for the 9-replacement to avoid colliding with the now-13 from the first edit. **Order matters**: do 11→13 first, then 10→12, then 9→11. The 9-replacement must include enough trailing context (`,` or ` `) to not match `9` inside `19`, `29`, etc.

Be conservative: if a line uses `fontSize: 9` (no trailing comma), use `replace_all=false` with surrounding context.

- [ ] **Step 3: Verify no remaining 9/10/11 fontSize values**

```bash
grep -nE "fontSize:\s*(9|10|11)\b" dashboard/src/components/conversation/RawLogView.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/components/conversation/RawLogView.tsx
git commit -m "feat(readability): bump RawLogView inline fontSize +2px"
```

---

### Task 6: Sweep `PhaseGroup.tsx`

**Files:**
- Modify: `dashboard/src/components/conversation/PhaseGroup.tsx`

- [ ] **Step 1: List current state**

```bash
grep -nE "fontSize:\s*(9|10|11|12|13)\b" dashboard/src/components/conversation/PhaseGroup.tsx
```

Expected: 4 lines at values 9 / 12 / 13.

- [ ] **Step 2: Apply the sweep (ordered)**

Apply edits in this exact order to avoid value collisions:

1. `fontSize: 13` → `fontSize: 15` (replace_all=true)
2. `fontSize: 12` → `fontSize: 14` (replace_all=true)
3. `fontSize: 9,` → `fontSize: 11,` (replace_all=true) — if the file uses `9` with a non-comma suffix, use targeted Edits with enough context.

- [ ] **Step 3: Verify no remaining 9/10/11/12/13 fontSize values**

```bash
grep -nE "fontSize:\s*(9|10|11|12|13)\b" dashboard/src/components/conversation/PhaseGroup.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/components/conversation/PhaseGroup.tsx
git commit -m "feat(readability): bump PhaseGroup inline fontSize +2px"
```

---

### Task 7: Sweep `AutoDenialBlock.tsx` and `PromptInput.tsx`

These are bundled because each has only 2-4 occurrences and the file scope is small.

**Files:**
- Modify: `dashboard/src/components/conversation/AutoDenialBlock.tsx` (2 occurrences at value 10)
- Modify: `dashboard/src/components/conversation/PromptInput.tsx` (4 occurrences at values 12 / 13)

- [ ] **Step 1: Sweep AutoDenialBlock**

```
old_string: "fontSize: 10"
new_string: "fontSize: 12"
replace_all: true
```

Verify:

```bash
grep -nE "fontSize:\s*(9|10|11)\b" dashboard/src/components/conversation/AutoDenialBlock.tsx
```

Expected: no output.

- [ ] **Step 2: Sweep PromptInput (ordered: 13→15, then 12→14)**

```
old_string: "fontSize: 13"
new_string: "fontSize: 15"
replace_all: true
```

```
old_string: "fontSize: 12"
new_string: "fontSize: 14"
replace_all: true
```

Verify:

```bash
grep -nE "fontSize:\s*(9|10|11|12|13)\b" dashboard/src/components/conversation/PromptInput.tsx
```

Expected: no output.

- [ ] **Step 3: Commit (one combined commit)**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/components/conversation/AutoDenialBlock.tsx dashboard/src/components/conversation/PromptInput.tsx
git commit -m "feat(readability): bump AutoDenialBlock + PromptInput inline fontSize +2px"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full dashboard test suite**

```bash
cd dashboard && pnpm test 2>&1 | tail -8
```

Expected: 0 failures.

- [ ] **Step 2: TypeScript type check**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | tail -3
```

Expected: no output.

- [ ] **Step 3: Cross-cutting scope check — confirm no out-of-scope files were touched**

```bash
cd /Users/soh/working/ai/claude-devtools
git diff --name-only c95f3cd..HEAD | grep -v "^docs/" | sort
```

Expected: ONLY these files:

```
dashboard/src/components/conversation/AutoDenialBlock.tsx
dashboard/src/components/conversation/PhaseGroup.tsx
dashboard/src/components/conversation/PromptInput.tsx
dashboard/src/components/conversation/RawLogView.tsx
dashboard/src/components/conversation/TaskGrid.tsx
dashboard/src/components/conversation/ToolEntries.tsx
dashboard/src/styles/globals.css
dashboard/src/styles/globals.test.ts
```

(Plus any earlier Insights-nudge files from prior work.) The conversation-text-readability commits should NOT touch `Insights*`, `sidebar/*`, `panels/*`, `bottom-panel/*`, `controls/*`, or `viewer/*`.

- [ ] **Step 4: Manual visual smoke (dev mode)**

```bash
cd dashboard && pnpm dev
```

Open the dashboard at the Vite URL it prints. Verify:

- Open any session with at least one tool call and one background agent dispatch.
- Conversation panel: body text is comfortable to read, model badge is legible, tool entries are readable, background agent rows are legible.
- Insights page (`/insights`), top bar tabs, sidebar repo list, and bottom panel must look IDENTICAL to before. If anything changed there, the sweep accidentally hit a shared utility — revert and investigate.
- BackgroundAgentGroup rows: if the `t-mono-xs` bump caused the row to wrap to two lines, widen the affected `minWidth: 56/48` columns by 8-12px (in `BackgroundAgentGroup.tsx`). Otherwise no change needed.

- [ ] **Step 5: Final commit (only if visual review required tweaks)**

If the visual check needed minor column widening or other small adjustments:

```bash
cd /Users/soh/working/ai/claude-devtools
git add <changed files>
git commit -m "fix(readability): widen background agent columns to fit larger mono-xs"
```

If no tweaks were needed, no commit is required — implementation is complete.
