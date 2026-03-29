# Frontend Guide (Dashboard)

## Purpose
Define enforceable frontend standards for the dashboard so UI changes stay type-safe, readable, visually consistent, and maintainable.

## The Rule
1. **Type**
   - Use TypeScript strictly. New code must have explicit prop and return types where inference is not obvious.
   - Use `interface` for component props and shared contracts in `src/lib/types.ts`.
   - Use `import type { ... }` for type-only imports.
   - Avoid `any`. If unavoidable at integration boundaries, isolate it to the narrowest scope and add a short justification comment.

2. **Spacing**
   - Keep JSX layout readable with explicit Tailwind `gap-*`, `px-*`, `py-*`, and `space-*` utilities.
   - Do not ship crowded stat clusters; group related items inside a local flex container with spacing.
   - Prefer semantic utility clusters via shared classes in `src/styles/globals.css` (`@layer components`) for repeated layout patterns.

3. **Styling**
   - Dashboard styling is **Tailwind-first**. Use `className` + semantic `dt-*` tokens from `tailwind.config.js`.
   - Global tokens and shared visual primitives live in `src/styles/globals.css` and Tailwind theme extensions.
   - Do not add new static `style={{ ... }}` blocks in TSX.
   - Inline styles are allowed only for truly dynamic values (computed transforms, runtime colors, XYFlow positional style objects, etc.).
   - Do not introduce CSS Modules for new dashboard features unless architecture explicitly changes.

4. **Color**
   - Use semantic Tailwind token classes (`text-dt-*`, `bg-dt-*`, `border-dt-*`) for foreground, background, border, accent, and state.
   - Do not add ad-hoc hex colors in components (except unavoidable third-party API inputs).
   - Exception: third-party chart/graph APIs that require direct color values. Keep these rare and centralized.

5. **Responsive Rule**
   - This UI is desktop-first, but must not break on narrower widths.
   - Prevent horizontal overflow regressions in top-level panels and bars.
   - Use resilient flex/grid behavior (`minWidth: 0`, controlled wrapping/truncation) where content can expand.
   - Any fixed-width addition must be justified against current layout constraints.

6. **Import/Export**
   - Prefer named exports for components, hooks, helpers, and constants.
   - Keep default exports limited to app entry/root where already established.
   - Keep imports grouped and ordered: React/runtime imports, external deps, internal modules, then type imports where applicable.
   - Use relative imports consistent with existing dashboard patterns.

7. **Structure**
   - Keep feature UI in `src/components/*`, reusable logic in `src/hooks`, shared contracts/utilities in `src/lib`, and app context in `src/contexts`.
   - Co-locate feature-specific helpers with the owning feature folder when they are not broadly reused.
   - Promote to `src/lib` only when reuse is proven across features.
   - Keep files focused: one primary component/hook responsibility per file.

8. **UI Lib**
   - Approved frontend stack: React 18, TypeScript, Tailwind utilities, Recharts, `@xyflow/react` (custom tree layout, no dagre), `lucide-react`, `react-markdown` + `remark-gfm`, `@tanstack/react-router`, `@tanstack/react-virtual`, and existing project dependencies.
   - Do not introduce new UI frameworks/component systems (e.g., MUI, Chakra, AntD) without explicit architecture approval.
   - Prefer existing primitives and tokens before adding new UI dependencies.

9. **Markdown Rendering**
   - Response text is rendered via `react-markdown` with `remark-gfm` in `ResponseBlock.tsx`.
   - Markdown elements are styled via the `components` prop using Tailwind `dt-*` tokens — not global CSS or `<style>` blocks.
   - Code blocks: `bg-dt-bg3`, monospace. Inline code: `bg-dt-bg3 text-dt-accent`.
   - Do not add a second markdown renderer or switch to `marked`/`remark` without explicit architecture approval.

10. **Cost & Pricing**
    - Per-turn costs use `calculateTurnCost()` from `lib/cost.ts` with per-model pricing (opus/sonnet/haiku).
    - Do NOT use the deprecated `INPUT_COST_PER_TOKEN` / `OUTPUT_COST_PER_TOKEN` constants in new code.
    - When Anthropic changes model prices, update `MODEL_PRICING` in BOTH `server/src/analyzer/metrics.ts` AND `dashboard/src/lib/cost.ts`.

## Examples
- **Good (Type):** `interface TopBarProps { metrics: SessionMetrics | null }` plus `import type { SessionMetrics }`.
- **Bad (Type):** `function TopBar(props: any) { ... }`.
- **Good (Spacing):** Related KPI values wrapped in a local flex group with explicit `gap`.
- **Bad (Spacing):** Multiple stats concatenated inline without container spacing.
- **Good (Styling):** `className="flex items-center gap-2 text-dt-text1 bg-dt-bg2"`.
- **Bad (Styling):** `style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-1)" }}` for static layout.
- **Good (Color):** `className="text-dt-text0 bg-dt-bg2"`.
- **Bad (Color):** `color: "#a4b1ff"` for normal UI text.
- **Good (Import/Export):** `export function ConversationView(...)` and named imports.
- **Bad (UI Lib):** Adding a new component framework for a single widget.

## Guardrails
- Run `pnpm --dir dashboard lint:styles` to detect newly introduced inline `style={{` blocks outside the approved dynamic allowlist.
- `pnpm lint` at repo root runs ESLint + inline-style guard together; CI should call this command.

## P0 Lessons

### 2026-03-29: Hardcoded sonnet pricing in turn costs
Dashboard used `INPUT_COST_PER_TOKEN = 0.000003` (sonnet) for all per-turn costs. Opus sessions showed 5x lower costs than reality. Fixed by adding `calculateTurnCost()` with per-model `MODEL_PRICING` table. Rule 10 added to prevent recurrence.

### 2026-03-29: Duplicate permission blocks
`usePermissions.handlePermissionRequest` appended WS-received permissions without checking if they already existed from the REST fetch. Same permission rendered twice. Fixed by adding `prev.some(p => p.id === permission.id)` guard.
